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
export const OPEN_OKX_STATES = new Set(['live', 'partially_filled', 'unknown']);

export function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
  try {
    const dir = fs.openSync(path.dirname(file), 'r');
    fs.fsyncSync(dir);
    fs.closeSync(dir);
  } catch { /* best effort on non-POSIX filesystems */ }
}

export function hasNonTerminalOperations(operations) {
  return (operations?.operations || []).some((op) => op.state !== 'terminal');
}

export function initializeOperations(plan, operations = {}) {
  operations.schemaVersion ||= 1;
  operations.operations ||= [];
  operations.updatedAt ||= new Date().toISOString();
  const byOperationId = new Map(operations.operations.map((op) => [op.operationId, op]));
  for (const entry of plan.entries || []) {
    const operationId = entry.operationId || operationIdForEntry(entry, plan);
    const quote = quoteCurrency(entry.instId);
    entry.operationId = operationId;
    entry.clOrdId ||= deterministicClOrdId({ ...entry, operationId });
    let op = byOperationId.get(operationId);
    if (!op) {
      op = {
        operationId,
        entryId: entry.id,
        instId: entry.instId,
        quoteCcy: quote,
        baseCcy: baseCurrency(entry.instId),
        requestedQuoteAmount: Number(entry.amount),
        dueAt: entry.dueAt,
        clOrdId: entry.clOrdId,
        state: entry.status === 'done' ? 'terminal' : 'prepared',
        terminalState: entry.status === 'done' ? 'filled' : null,
        okxState: entry.status === 'done' ? 'filled' : 'prepared',
        submissionAttempts: Number(entry.attempts || 0),
        reconciliationAttempts: 0,
        preflightFailures: 0,
        events: [],
        createdAt: plan.createdAt || new Date().toISOString(),
      };
      operations.operations.push(op);
      byOperationId.set(operationId, op);
    } else {
      entry.clOrdId = op.clOrdId || entry.clOrdId;
      entry.attempts = op.submissionAttempts || entry.attempts || 0;
    }
  }
  return operations;
}

export function projectOperationToEntry(op, entry) {
  if (!entry) return;
  entry.operationId = op.operationId;
  entry.clOrdId = op.clOrdId;
  entry.attempts = op.submissionAttempts || 0;
  entry.reconciliationAttempts = op.reconciliationAttempts || 0;
  entry.preflightFailures = op.preflightFailures || 0;
  if (op.state === 'terminal') {
    entry.status = op.terminalState === 'filled' ? 'done' : op.terminalState === 'canceled' || op.terminalState === 'cancelled' ? 'canceled' : 'rejected';
    entry.retryable = false;
    entry.executedAt = op.terminalAt || entry.executedAt;
    entry.ordId = op.ordId || entry.ordId;
    entry.filledQty = op.filledQty;
    entry.avgPrice = op.avgPrice;
    if (op.terminalState !== 'filled') entry.error = `ordre terminal ${op.terminalState}${op.filledQty > 0 ? ' avec remplissage partiel' : ' sans remplissage'}`;
  } else if (op.state === 'reconcile_pending' || op.state === 'submitting') {
    entry.status = 'reconcile_pending';
    entry.retryable = false;
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
  const state = order.state || 'unknown';
  const filledQty = Number(order.accFillSz ?? order.filledQty ?? 0);
  const avgPrice = Number(order.avgPx ?? order.avgPrice ?? 0);
  const executedQuoteAmount = Number(order.fillNotionalUsd ?? order.accFillQuote ?? order.fillPxSz ?? (filledQty > 0 && avgPrice > 0 ? filledQty * avgPrice : 0));
  return {
    ordId: order.ordId,
    clOrdId: order.clOrdId,
    state,
    filledQty: Number.isFinite(filledQty) ? filledQty : 0,
    avgPrice: Number.isFinite(avgPrice) ? avgPrice : 0,
    executedQuoteAmount: Number.isFinite(executedQuoteAmount) ? executedQuoteAmount : 0,
    fee: Number(order.fee || 0),
    feeCcy: order.feeCcy || '',
    cTime: order.cTime,
    uTime: order.uTime,
  };
}

function terminalHistory(op, fill, plan, source, now) {
  const terminalState = fill.state === 'cancelled' ? 'canceled' : fill.state;
  return {
    operationId: op.operationId,
    id: op.entryId,
    executedAt: now.toISOString(),
    terminalAt: now.toISOString(),
    instId: op.instId,
    baseCcy: op.baseCcy,
    quoteCcy: op.quoteCcy,
    requestedQuoteAmount: op.requestedQuoteAmount,
    amount: fill.executedQuoteAmount || (terminalState === 'filled' ? op.requestedQuoteAmount : 0),
    executedQuoteAmount: fill.executedQuoteAmount || (terminalState === 'filled' ? op.requestedQuoteAmount : 0),
    filledQty: fill.filledQty,
    avgPrice: fill.avgPrice,
    fee: fill.fee,
    feeCcy: fill.feeCcy,
    ordId: fill.ordId || op.ordId,
    clOrdId: op.clOrdId,
    demo: plan.demo,
    source,
    status: terminalState === 'filled' ? 'filled' : (fill.filledQty > 0 ? 'partial' : terminalState),
    okxState: terminalState,
    okxCreatedAt: fill.cTime,
    okxUpdatedAt: fill.uTime,
  };
}

export async function reconcileOperation(op, { client, history, plan, now = new Date(), persist = async () => {} }) {
  if (op.state === 'terminal') return { changed: false, terminal: true };
  op.reconciliationAttempts = (op.reconciliationAttempts || 0) + 1;
  recordEvent(op, 'reconcile_attempt', {}, now);
  await persist();
  const remote = await client.findOrderByClOrdId(op.instId, op.clOrdId);
  if (!remote) {
    if (op.state === 'submitting') op.state = 'reconcile_pending';
    op.okxState = 'unknown';
    recordEvent(op, 'reconcile_not_found', {}, now);
    await persist();
    return { changed: true, terminal: false, found: false };
  }
  const fill = normalizeRemote(remote);
  op.ordId = fill.ordId || op.ordId;
  op.okxState = fill.state;
  op.filledQty = fill.filledQty;
  op.avgPrice = fill.avgPrice;
  op.executedQuoteAmount = fill.executedQuoteAmount;
  op.fee = fill.fee;
  op.feeCcy = fill.feeCcy;
  if (TERMINAL_OKX_STATES.has(fill.state)) {
    op.state = 'terminal';
    op.terminalState = fill.state === 'cancelled' ? 'canceled' : fill.state;
    op.terminalAt = now.toISOString();
    addPurchaseIfMissing(history, terminalHistory(op, fill, plan, 'schedule-reconciled', now));
    recordEvent(op, 'terminal', { okxState: op.terminalState }, now);
    await persist();
    return { changed: true, terminal: true, found: true, okxState: op.terminalState };
  }
  if (OPEN_OKX_STATES.has(fill.state)) {
    op.state = 'reconcile_pending';
    recordEvent(op, 'still_open', { okxState: fill.state }, now);
    await persist();
    return { changed: true, terminal: false, found: true, okxState: fill.state };
  }
  op.state = 'reconcile_pending';
  op.okxState = 'unknown';
  recordEvent(op, 'unknown_state', { okxState: fill.state }, now);
  await persist();
  return { changed: true, terminal: false, found: true, okxState: fill.state };
}

export async function runPlanner({ plan, history = { purchases: [] }, operations = {}, client, now = new Date(), dryRun = true, demo = true, persist = async () => {}, log = () => {} }) {
  const risk = validatePlanStrict(plan);
  operations = initializeOperations(plan, operations);
  history.purchases ||= [];
  const entryByOperationId = new Map(plan.entries.map((e) => [e.operationId, e]));
  const failures = [];

  async function persistAll() {
    operations.updatedAt = now.toISOString();
    for (const op of operations.operations) projectOperationToEntry(op, entryByOperationId.get(op.operationId));
    await persist({ plan, history, operations });
  }

  await persistAll();

  // Toujours réconcilier les opérations ambiguës avant solde/plafonds/maxAttempts.
  for (const op of operations.operations.filter((candidate) => candidate.state !== 'terminal')) {
    try {
      await reconcileOperation(op, { client, history, plan, now, persist: persistAll });
      if (op.state !== 'terminal' && op.okxState !== 'unknown' && op.okxState !== 'prepared') failures.push(`${op.operationId}: ${op.okxState}`);
    } catch (err) {
      failures.push(`${op.operationId}: ${err.message}`);
      recordEvent(op, 'reconcile_error', { error: err.message }, now);
      await persistAll();
    }
  }

  for (const entry of plan.entries) {
    const op = operations.operations.find((candidate) => candidate.operationId === entry.operationId);
    if (!op || op.state === 'terminal' || op.state === 'reconcile_pending' || op.state === 'submitting') continue;
    if (!isDue(entry, now.getTime(), risk)) continue;
    try {
      validateEntrySafety(entry, plan, history, risk, now, operations);
      const price = await client.lastPrice(entry.instId);
      const balance = await client.availableBalance(quoteCurrency(entry.instId));
      log(`Prix ${entry.instId}: ${price}; solde ${quoteCurrency(entry.instId)}: ${balance}`);
      if (balance < Number(entry.amount)) throw new Error(`solde insuffisant : ${balance} ${quoteCurrency(entry.instId)} disponible, ${entry.amount} requis`);
      if (dryRun) {
        entry.lastDryRunAt = now.toISOString();
        recordEvent(op, 'dry_run', {}, now);
        await persistAll();
        continue;
      }
      if (op.submissionAttempts >= risk.maxAttempts) {
        throw new Error(`plafond de tentatives atteint : ${op.submissionAttempts}/${risk.maxAttempts}`);
      }
      op.state = 'submitting';
      op.submissionAttempts = (op.submissionAttempts || 0) + 1;
      entry.attempts = op.submissionAttempts;
      recordEvent(op, 'submit_attempt', { attempt: op.submissionAttempts }, now);
      await persistAll();
      const result = await client.marketBuy(entry.instId, Number(entry.amount), op.clOrdId);
      op.ordId = result.ordId || op.ordId;
      op.state = 'reconcile_pending';
      op.okxState = result.state || 'submitted';
      recordEvent(op, 'submitted', { ordId: op.ordId }, now);
      await persistAll();
      await reconcileOperation(op, { client, history, plan, now, persist: persistAll });
      if (op.state !== 'terminal') failures.push(`${op.operationId}: ${op.okxState}`);
    } catch (err) {
      op.preflightFailures = (op.preflightFailures || 0) + (op.state === 'prepared' ? 1 : 0);
      recordEvent(op, 'error', { error: err.message, retryable: classifyError(err).retryable }, now);
      markFailure(entry, err, risk, now);
      failures.push(`${entry.id}: ${err.message}`);
      await persistAll();
    }
  }

  await persistAll();
  return { plan, history, operations, failures };
}
