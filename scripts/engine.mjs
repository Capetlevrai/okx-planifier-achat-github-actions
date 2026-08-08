import fs from 'node:fs';
import path from 'node:path';
import { baseCurrency, quoteCurrency } from './okx.mjs';
import {
  addPurchaseIfMissing,
  classifyError,
  deterministicClOrdId,
  isDue,
  markFailure,
  operationIdForEntry,
  validateEntrySafety,
  validatePlanStrict,
} from './safety.mjs';

export const TERMINAL_OKX_STATES = new Set(['filled', 'canceled', 'cancelled', 'rejected']);
export const OPEN_OKX_STATES = new Set(['live', 'partially_filled', 'unknown', 'submitted']);
const OPERATION_STATES = new Set(['prepared', 'submitting', 'reconcile_pending', 'terminal']);
const AMBIGUOUS_STATES = new Set(['submitting', 'reconcile_pending']);

export function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  let fd;
  try {
    fd = fs.openSync(tmp, 'wx');
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, file);
    try {
      const dir = fs.openSync(path.dirname(file), 'r');
      try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    } catch { /* best effort on non-POSIX filesystems */ }
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* ignore cleanup error */ }
    }
    try { fs.unlinkSync(tmp); } catch { /* file may not exist */ }
    throw error;
  }
}

/** Prepared entries have never been submitted and may safely be replaced. */
export function hasNonTerminalOperations(operations) {
  return (operations?.operations || []).some((op) => AMBIGUOUS_STATES.has(op.state));
}

function validateOperationShape(op, seenOperationIds, seenClOrdIds) {
  if (!op || typeof op !== 'object' || Array.isArray(op)) throw new Error('Registre d’opérations invalide.');
  if (!/^op_[a-f0-9]{24}$/.test(op.operationId || '')) throw new Error(`operationId de registre invalide : ${op.operationId}.`);
  if (!/^[A-Za-z0-9]{1,32}$/.test(op.clOrdId || '')) throw new Error(`clOrdId de registre invalide pour ${op.operationId}.`);
  if (seenOperationIds.has(op.operationId) || seenClOrdIds.has(op.clOrdId)) throw new Error(`Doublon dans le registre : ${op.operationId}/${op.clOrdId}.`);
  seenOperationIds.add(op.operationId);
  seenClOrdIds.add(op.clOrdId);
  if (!OPERATION_STATES.has(op.state)) throw new Error(`État de registre invalide pour ${op.operationId} : ${op.state}.`);
  if (op.state === 'terminal' && !['filled', 'canceled', 'cancelled', 'rejected'].includes(op.terminalState)) throw new Error(`terminalState invalide pour ${op.operationId}.`);
  if (op.demo !== undefined && typeof op.demo !== 'boolean') throw new Error(`Mode de compte invalide pour ${op.operationId}.`);
  if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(op.instId || '')) throw new Error(`Instrument de registre invalide pour ${op.operationId}.`);
  const amount = Number(op.requestedQuoteAmount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(`Montant de registre invalide pour ${op.operationId}.`);
  if (op.quoteCcy !== quoteCurrency(op.instId) || op.baseCcy !== baseCurrency(op.instId)) throw new Error(`Devises de registre incohérentes pour ${op.operationId}.`);
  if (typeof op.dueAt !== 'string' || !Number.isFinite(new Date(op.dueAt).getTime())) throw new Error(`dueAt de registre invalide pour ${op.operationId}.`);
  for (const key of ['submissionAttempts', 'reconciliationAttempts', 'preflightFailures']) {
    if (op[key] !== undefined && (!Number.isInteger(Number(op[key])) || Number(op[key]) < 0)) throw new Error(`${key} invalide pour ${op.operationId}.`);
  }
  for (const key of ['executedQuoteAmount', 'filledQty', 'avgPrice', 'fee']) {
    if (op[key] !== undefined && op[key] !== null && !Number.isFinite(Number(op[key]))) throw new Error(`${key} invalide pour ${op.operationId}.`);
  }
  if (op.events !== undefined && !Array.isArray(op.events)) throw new Error(`events invalide pour ${op.operationId}.`);
}

function terminalStateForEntry(entry) {
  if (entry.status === 'done') return 'filled';
  if (entry.status === 'canceled') return 'canceled';
  if (entry.status === 'rejected') return 'rejected';
  return null;
}

export function initializeOperations(plan, operations = {}) {
  if (!operations || typeof operations !== 'object' || Array.isArray(operations)) throw new Error('data/operations.json invalide.');
  if (operations.schemaVersion !== undefined && operations.schemaVersion !== 1) throw new Error(`Version de registre non prise en charge : ${operations.schemaVersion}.`);
  if (operations.operations !== undefined && !Array.isArray(operations.operations)) throw new Error('operations.operations doit être un tableau.');
  operations.schemaVersion = 1;
  operations.operations ||= [];

  const seenOperationIds = new Set();
  const seenClOrdIds = new Set();
  for (const op of operations.operations) validateOperationShape(op, seenOperationIds, seenClOrdIds);

  const currentOperationIds = new Set(plan.entries.map((entry) => operationIdForEntry(entry, plan)));
  // Une opération prepared n'a jamais franchi la barrière pré-POST. Les anciennes
  // opérations prepared d'un plan remplacé ne sont donc ni financières ni ambiguës.
  operations.operations = operations.operations.filter((op) => op.state !== 'prepared' || currentOperationIds.has(op.operationId));
  const byOperationId = new Map(operations.operations.map((op) => [op.operationId, op]));

  for (const entry of plan.entries) {
    const operationId = operationIdForEntry(entry, plan);
    const expectedClOrdId = deterministicClOrdId({ ...entry, operationId });
    entry.operationId = operationId;
    entry.clOrdId = expectedClOrdId;
    let op = byOperationId.get(operationId);
    if (!op) {
      const terminalState = terminalStateForEntry(entry);
      op = {
        operationId,
        entryId: entry.id,
        planCreatedAt: plan.createdAt,
        demo: plan.demo,
        instId: entry.instId,
        quoteCcy: quoteCurrency(entry.instId),
        baseCcy: baseCurrency(entry.instId),
        requestedQuoteAmount: Number(entry.amount),
        dueAt: entry.dueAt,
        clOrdId: expectedClOrdId,
        state: terminalState ? 'terminal' : (entry.status === 'reconcile_pending' || entry.status === 'partial' ? 'reconcile_pending' : 'prepared'),
        terminalState,
        okxState: terminalState || (entry.status === 'reconcile_pending' || entry.status === 'partial' ? 'unknown' : 'prepared'),
        ordId: entry.ordId || null,
        submissionAttempts: Number(entry.attempts || 0),
        reconciliationAttempts: Number(entry.reconciliationAttempts || 0),
        preflightFailures: Number(entry.preflightFailures || 0),
        filledQty: entry.filledQty ?? null,
        avgPrice: entry.avgPrice ?? null,
        events: [],
        createdAt: plan.createdAt,
      };
      operations.operations.push(op);
      byOperationId.set(operationId, op);
    } else {
      const immutableMismatch = op.entryId !== entry.id || op.instId !== entry.instId || op.dueAt !== entry.dueAt ||
        Number(op.requestedQuoteAmount) !== Number(entry.amount) || op.clOrdId !== expectedClOrdId;
      if (immutableMismatch) throw new Error(`Le registre ne correspond plus à l'entrée ${entry.id}; exécution refusée.`);
      if (op.demo === undefined) op.demo = plan.demo;
      if (!op.planCreatedAt) op.planCreatedAt = plan.createdAt;
      entry.attempts = Number(op.submissionAttempts || 0);
    }
  }
  operations.updatedAt ||= new Date().toISOString();
  return operations;
}

export function projectOperationToEntry(op, entry) {
  if (!entry) return;
  entry.operationId = op.operationId;
  entry.clOrdId = op.clOrdId;
  entry.attempts = Number(op.submissionAttempts || 0);
  entry.reconciliationAttempts = Number(op.reconciliationAttempts || 0);
  entry.preflightFailures = Number(op.preflightFailures || 0);
  if (op.state === 'terminal') {
    entry.status = op.terminalState === 'filled' ? 'done' : op.terminalState === 'canceled' || op.terminalState === 'cancelled' ? 'canceled' : 'rejected';
    entry.retryable = false;
    entry.executedAt = op.terminalAt || entry.executedAt;
    entry.ordId = op.ordId || entry.ordId;
    entry.filledQty = op.filledQty;
    entry.avgPrice = op.avgPrice;
    delete entry.retryAfter;
    if (op.terminalState !== 'filled') entry.error = `ordre terminal ${op.terminalState}${Number(op.filledQty) > 0 ? ' avec remplissage partiel' : ' sans remplissage'}`;
    else delete entry.error;
  } else if (AMBIGUOUS_STATES.has(op.state)) {
    entry.status = 'reconcile_pending';
    entry.retryable = Number(op.submissionAttempts || 0) < 20;
    entry.ordId = op.ordId || entry.ordId;
    entry.filledQty = op.filledQty;
    entry.avgPrice = op.avgPrice;
    entry.error = `ordre ${op.okxState || op.state}, réconciliation à poursuivre`;
  }
}

function recordEvent(op, type, detail = {}, now = new Date()) {
  op.events ||= [];
  op.events.push({ at: now.toISOString(), type, ...detail });
}

function normalizeRemote(order) {
  if (!order) return null;
  const state = String(order.state || 'unknown');
  const filledQty = Number(order.accFillSz ?? order.filledQty ?? 0);
  const avgPrice = Number(order.avgPx ?? order.avgPrice ?? 0);
  const reportedQuote = Number(order.accFillQuote);
  const calculatedQuote = filledQty > 0 && avgPrice > 0 ? filledQty * avgPrice : 0;
  const executedQuoteAmount = Number.isFinite(reportedQuote) && reportedQuote >= 0 ? reportedQuote : calculatedQuote;
  return {
    ordId: order.ordId,
    clOrdId: order.clOrdId,
    state,
    filledQty: Number.isFinite(filledQty) && filledQty >= 0 ? filledQty : 0,
    avgPrice: Number.isFinite(avgPrice) && avgPrice >= 0 ? avgPrice : 0,
    executedQuoteAmount: Number.isFinite(executedQuoteAmount) && executedQuoteAmount >= 0 ? executedQuoteAmount : 0,
    fee: Number.isFinite(Number(order.fee)) ? Number(order.fee) : 0,
    feeCcy: order.feeCcy || '',
    cTime: order.cTime,
    uTime: order.uTime,
  };
}

function historyFromOperation(op, plan, source, now) {
  const terminalState = op.terminalState === 'cancelled' ? 'canceled' : op.terminalState;
  const executed = Number(op.executedQuoteAmount);
  const executedQuoteAmount = Number.isFinite(executed) && executed >= 0 ? executed : 0;
  return {
    operationId: op.operationId,
    id: op.entryId,
    executedAt: op.terminalAt || now.toISOString(),
    terminalAt: op.terminalAt || now.toISOString(),
    instId: op.instId,
    baseCcy: op.baseCcy,
    quoteCcy: op.quoteCcy,
    requestedQuoteAmount: op.requestedQuoteAmount,
    amount: executedQuoteAmount,
    executedQuoteAmount,
    filledQty: Number(op.filledQty || 0),
    avgPrice: Number(op.avgPrice || 0),
    fee: Number(op.fee || 0),
    feeCcy: op.feeCcy || '',
    ordId: op.ordId,
    clOrdId: op.clOrdId,
    demo: op.demo ?? plan.demo,
    source,
    status: terminalState === 'filled' ? 'filled' : (Number(op.filledQty) > 0 ? 'partial' : terminalState),
    okxState: terminalState,
    okxCreatedAt: op.okxCreatedAt,
    okxUpdatedAt: op.okxUpdatedAt,
  };
}

function hydrateOperationFromHistory(op, history) {
  const purchase = (history.purchases || []).find((item) =>
    (item.operationId && item.operationId === op.operationId) || (item.clOrdId && item.clOrdId === op.clOrdId));
  if (!purchase) return;
  op.executedQuoteAmount ??= Number(purchase.executedQuoteAmount ?? purchase.amount ?? 0);
  op.filledQty ??= Number(purchase.filledQty || 0);
  op.avgPrice ??= Number(purchase.avgPrice || 0);
  op.fee ??= Number(purchase.fee || 0);
  op.feeCcy ||= purchase.feeCcy || '';
  op.ordId ||= purchase.ordId;
  op.terminalAt ||= purchase.terminalAt || purchase.executedAt;
  op.demo ??= purchase.demo;
}

function terminalProblem(op) {
  if (op.state !== 'terminal') return null;
  if (op.terminalState !== 'filled') {
    return `${op.operationId}: état terminal ${op.terminalState}${Number(op.filledQty) > 0 ? ' avec remplissage partiel' : ''}`;
  }
  if (!(Number(op.executedQuoteAmount) > 0) || !(Number(op.filledQty) > 0)) return `${op.operationId}: remplissage sans montant/quantité exécuté fiable`;
  return null;
}

export async function reconcileOperation(op, { client, history, plan, now = new Date(), persist = async () => {} }) {
  if (op.state === 'terminal') return { changed: false, terminal: true };
  op.reconciliationAttempts = Number(op.reconciliationAttempts || 0) + 1;
  recordEvent(op, 'reconcile_attempt', {}, now);
  await persist();
  const remote = await client.findOrderByClOrdId(op.instId, op.clOrdId);
  if (!remote) {
    op.notFoundCount = Number(op.notFoundCount || 0) + 1;
    if (AMBIGUOUS_STATES.has(op.state)) op.okxState = 'unknown';
    recordEvent(op, 'reconcile_not_found', { notFoundCount: op.notFoundCount }, now);
    await persist();
    return { changed: true, terminal: false, found: false };
  }
  if (remote.clOrdId && remote.clOrdId !== op.clOrdId) throw new Error(`Réconciliation incohérente : clOrdId distant différent pour ${op.operationId}.`);
  const fill = normalizeRemote(remote);
  op.ordId = fill.ordId || op.ordId;
  op.okxState = fill.state;
  op.filledQty = fill.filledQty;
  op.avgPrice = fill.avgPrice;
  op.executedQuoteAmount = fill.executedQuoteAmount;
  op.fee = fill.fee;
  op.feeCcy = fill.feeCcy;
  op.okxCreatedAt = fill.cTime;
  op.okxUpdatedAt = fill.uTime;
  op.notFoundCount = 0;
  if (TERMINAL_OKX_STATES.has(fill.state)) {
    if (fill.state === 'filled' && (!(fill.filledQty > 0) || !(fill.executedQuoteAmount > 0))) {
      op.state = 'reconcile_pending';
      op.okxState = 'unknown';
      recordEvent(op, 'invalid_filled_payload', {}, now);
      await persist();
      throw new Error(`Ordre ${op.operationId} annoncé filled sans quantité/montant exécuté fiable.`);
    }
    op.state = 'terminal';
    op.terminalState = fill.state === 'cancelled' ? 'canceled' : fill.state;
    op.terminalAt = now.toISOString();
    addPurchaseIfMissing(history, historyFromOperation(op, plan, 'schedule-reconciled', now));
    recordEvent(op, 'terminal', { okxState: op.terminalState }, now);
    await persist();
    return { changed: true, terminal: true, found: true, okxState: op.terminalState };
  }
  op.state = 'reconcile_pending';
  if (!OPEN_OKX_STATES.has(fill.state)) op.okxState = 'unknown';
  recordEvent(op, OPEN_OKX_STATES.has(fill.state) ? 'still_open' : 'unknown_state', { okxState: fill.state }, now);
  await persist();
  return { changed: true, terminal: false, found: true, okxState: fill.state };
}

export async function runPlanner({
  plan,
  history = { purchases: [] },
  operations = {},
  client,
  now = new Date(),
  dryRun = true,
  demo = true,
  realTradingArmed = false,
  allowNewSubmissions = true,
  persist = async () => {},
  log = () => {},
}) {
  const risk = validatePlanStrict(plan);
  if (plan.demo !== demo) throw new Error('Le mode de compte effectif ne correspond pas au plan; exécution refusée.');
  // Un dry-run ne franchit jamais la barrière POST (voir le `if (dryRun)`
  // avant marketBuy). Il doit néanmoins pouvoir exécuter le préflight réel :
  // recherche idempotente, prix et solde. Le fusible reste obligatoire dès
  // qu'une véritable soumission est possible.
  const submissionsAllowed = dryRun || (allowNewSubmissions && (demo || realTradingArmed));
  if (!client || typeof client.findOrderByClOrdId !== 'function' || typeof client.marketBuy !== 'function') throw new Error('Client OKX injectable invalide.');

  operations = initializeOperations(plan, operations);
  history.purchases ||= [];
  for (const op of operations.operations) {
    hydrateOperationFromHistory(op, history);
    if (op.state === 'terminal' && op.terminalState === 'filled' && (!(Number(op.executedQuoteAmount) > 0) || !(Number(op.filledQty) > 0))) {
      throw new Error(`Registre terminal incomplet pour ${op.operationId}; réconciliation/audit manuel requis.`);
    }
    if (op.state === 'terminal' && op.terminalState) addPurchaseIfMissing(history, historyFromOperation(op, plan, 'registry-recovered', now));
  }
  const entryByOperationId = new Map(plan.entries.map((entry) => [entry.operationId, entry]));
  const failures = [];
  const addFailure = (message) => { if (message && !failures.includes(message)) failures.push(message); };

  async function persistAll() {
    operations.updatedAt = now.toISOString();
    for (const op of operations.operations) projectOperationToEntry(op, entryByOperationId.get(op.operationId));
    await persist({ plan, history, operations });
  }

  await persistAll();

  // Les seules opérations globalement réconciliées sont celles ayant franchi la
  // barrière pré-POST. Les opérations prepared sont vérifiées juste avant leur POST.
  for (const op of operations.operations.filter((candidate) => AMBIGUOUS_STATES.has(candidate.state))) {
    try {
      const result = await reconcileOperation(op, { client, history, plan, now, persist: persistAll });
      if (result.terminal) addFailure(terminalProblem(op));
      else if (result.found) addFailure(`${op.operationId}: ordre ${op.okxState}, réconciliation encore nécessaire`);
      else addFailure(`${op.operationId}: ordre ambigu introuvable, réconciliation manuelle requise; aucun nouveau POST`);
    } catch (error) {
      addFailure(`${op.operationId}: ${error.message}`);
      recordEvent(op, 'reconcile_error', { error: error.message }, now);
      await persistAll();
    }
  }

  for (const entry of plan.entries) {
    const op = operations.operations.find((candidate) => candidate.operationId === entry.operationId);
    if (!op || op.state === 'terminal') continue;
    const newSubmission = op.state === 'prepared' && isDue(entry, now.getTime(), risk);
    if (!newSubmission) continue;

    try {
      // Dernière recherche par clé déterministe avant tout contrôle d'une
      // nouvelle soumission. Une opération ayant déjà franchi la barrière POST
      // n'arrive jamais dans cette branche et reste en réconciliation GET-only.
      const lookup = await reconcileOperation(op, { client, history, plan, now, persist: persistAll });
      if (lookup.found) {
        if (lookup.terminal) addFailure(terminalProblem(op));
        else addFailure(`${op.operationId}: ordre ${op.okxState}, aucun nouveau POST`);
        continue;
      }
      if (!submissionsAllowed) {
        addFailure(`${op.operationId}: nouvelles soumissions désarmées; réconciliation seule autorisée`);
        continue;
      }
      validateEntrySafety(entry, plan, history, risk, now, operations, op.operationId);
      const price = await client.lastPrice(entry.instId);
      const balance = await client.availableBalance(quoteCurrency(entry.instId));
      log(`Prix ${entry.instId}: ${price}; vérification du solde ${quoteCurrency(entry.instId)} effectuée`);
      if (balance < Number(entry.amount)) throw new Error(`solde insuffisant : moins de ${entry.amount} ${quoteCurrency(entry.instId)} disponible`);
      if (dryRun) {
        log(`DRY RUN — ${entry.id}: aucun ordre transmis`);
        continue;
      }
      op.reservedAt ||= now.toISOString();

      if (op.submissionAttempts >= risk.maxAttempts) {
        addFailure(`${op.operationId}: plafond de tentatives atteint, réconciliation seule`);
        continue;
      }
      op.state = 'submitting';
      op.submissionAttempts = Number(op.submissionAttempts || 0) + 1;
      op.lastSubmitAt = now.toISOString();
      entry.attempts = op.submissionAttempts;
      recordEvent(op, 'submit_attempt', { attempt: op.submissionAttempts }, now);
      await persistAll();

      const result = await client.marketBuy(entry.instId, Number(entry.amount), op.clOrdId);
      if (result.clOrdId && result.clOrdId !== op.clOrdId) throw new Error('Réponse de soumission avec clOrdId incohérent.');
      op.ordId = result.ordId || op.ordId;
      op.state = 'reconcile_pending';
      op.okxState = result.state || 'submitted';
      recordEvent(op, 'submitted', { ordId: op.ordId }, now);
      await persistAll();
      const reconciled = await reconcileOperation(op, { client, history, plan, now, persist: persistAll });
      if (reconciled.terminal) addFailure(terminalProblem(op));
      else addFailure(`${op.operationId}: ordre ${op.okxState}, réconciliation encore nécessaire`);
    } catch (error) {
      const classification = classifyError(error);
      if (op.state === 'submitting' && error?.okxCode && !classification.retryable) {
        op.state = 'terminal';
        op.terminalState = 'rejected';
        op.okxState = 'rejected';
        op.terminalAt = now.toISOString();
        op.executedQuoteAmount = 0;
        op.filledQty = 0;
        addPurchaseIfMissing(history, historyFromOperation(op, plan, 'schedule-rejected', now));
        recordEvent(op, 'terminal_rejection', { okxCode: String(error.okxCode) }, now);
      } else if (op.state === 'submitting') {
        op.okxState = 'unknown';
      } else if (op.state === 'prepared') {
        op.preflightFailures = Number(op.preflightFailures || 0) + 1;
      }
      recordEvent(op, 'error', { error: error.message, retryable: classification.retryable }, now);
      markFailure(entry, error, risk, now);
      addFailure(`${entry.id}: ${error.message}`);
      await persistAll();
    }
  }

  for (const op of operations.operations) {
    if (AMBIGUOUS_STATES.has(op.state) && op.submissionAttempts >= risk.maxAttempts) {
      addFailure(`${op.operationId}: plafond de soumission atteint; réconciliation en lecture seule requise`);
    }
  }
  await persistAll();
  return { plan, history, operations, failures };
}
