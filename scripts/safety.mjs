import crypto from 'node:crypto';
import { quoteCurrency, SITES } from './okx.mjs';

export const DEFAULT_RISK = {
  maxAttempts: 3,
  retryDelayMinutes: 60,
  orderPollAttempts: 10,
  orderPollDelayMs: 1500,
  allowedInstIds: [],
  maxOrderAmount: null,
  maxDailyQuoteAmount: null,
  maxPlanQuoteAmount: null,
  maxLifetimeQuoteAmount: null,
};

const KNOWN_ENTRY_STATUSES = new Set(['pending', 'done', 'failed', 'partial', 'reconcile_pending', 'canceled', 'rejected']);

export function finitePositive(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${label} doit être un nombre fini strictement positif.`);
  return n;
}

export function validIsoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) {
    throw new Error(`${label} doit être une date ISO UTC complète.`);
  }
  const parsed = new Date(value);
  const time = parsed.getTime();
  if (!Number.isFinite(time) || parsed.toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new Error(`${label} contient une date impossible.`);
  }
  return time;
}

/** clOrdId OKX déterministe : même opération logique => même identifiant client. */
export function deterministicClOrdId(entry, prefix = 'dca') {
  const logical = entry.operationId || `${entry.id}|${entry.instId}|${entry.dueAt}|${entry.amount}|${entry.planCreatedAt || ''}`;
  const hash = crypto.createHash('sha256').update(logical).digest('hex').slice(0, 24);
  return `${prefix}${hash}`.slice(0, 32);
}

export function operationIdForEntry(entry, plan) {
  const source = `${plan.createdAt || ''}|${entry.id}|${entry.instId}|${entry.dueAt}|${entry.amount}`;
  return `op_${crypto.createHash('sha256').update(source).digest('hex').slice(0, 24)}`;
}

export function normalizeRisk(plan) {
  const risk = {
    ...DEFAULT_RISK,
    ...(plan.risk || {}),
    allowedInstIds: plan.risk?.allowedInstIds?.length ? plan.risk.allowedInstIds : plan.strategy?.instIds || [],
  };
  if (!Array.isArray(risk.allowedInstIds) || risk.allowedInstIds.length === 0) {
    throw new Error('risk.allowedInstIds doit être une whitelist non vide.');
  }
  if (new Set(risk.allowedInstIds).size !== risk.allowedInstIds.length) throw new Error('risk.allowedInstIds contient des doublons.');
  if (!Number.isInteger(Number(risk.maxAttempts)) || Number(risk.maxAttempts) < 1 || Number(risk.maxAttempts) > 20) {
    throw new Error('risk.maxAttempts doit être un entier borné entre 1 et 20.');
  }
  risk.maxAttempts = Number(risk.maxAttempts);
  for (const key of ['retryDelayMinutes', 'orderPollAttempts', 'orderPollDelayMs']) {
    if (!Number.isInteger(Number(risk[key])) || Number(risk[key]) < 0) throw new Error(`risk.${key} doit être un entier positif ou nul.`);
    risk[key] = Number(risk[key]);
  }
  for (const key of ['maxOrderAmount', 'maxDailyQuoteAmount', 'maxPlanQuoteAmount', 'maxLifetimeQuoteAmount']) {
    if (risk[key] !== null && risk[key] !== undefined) risk[key] = finitePositive(risk[key], `risk.${key}`);
  }
  if (risk.maxOrderAmount === null || risk.maxDailyQuoteAmount === null || risk.maxPlanQuoteAmount === null || risk.maxLifetimeQuoteAmount === null) {
    throw new Error('Les quatre plafonds financiers (ordre, jour, plan, durée de vie) sont obligatoires.');
  }
  if (risk.maxDailyQuoteAmount < risk.maxOrderAmount) throw new Error('risk.maxDailyQuoteAmount doit être supérieur ou égal à risk.maxOrderAmount.');
  return risk;
}

export function validatePlanStrict(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) throw new Error('plan.json absent ou invalide.');
  validIsoDate(plan.createdAt, 'plan.createdAt');
  if (typeof plan.live !== 'boolean') throw new Error('plan.live doit être booléen.');
  if (typeof plan.demo !== 'boolean') throw new Error('plan.demo doit être booléen.');
  if (!SITES[plan.site]) throw new Error(`plan.site inconnu : ${plan.site}.`);
  if (plan.baseUrl !== SITES[plan.site].baseUrl) throw new Error('plan.baseUrl ne correspond pas au site OKX autorisé.');
  if (!plan.strategy || typeof plan.strategy !== 'object') throw new Error('plan.strategy est obligatoire.');
  if (!Array.isArray(plan.strategy.instIds) || plan.strategy.instIds.length === 0) throw new Error('plan.strategy.instIds doit être non vide.');
  if (!Array.isArray(plan.entries) || plan.entries.length === 0) throw new Error('plan.entries doit être un tableau non vide.');

  const risk = normalizeRisk(plan);
  const allowed = new Set(risk.allowedInstIds);
  const strategyIds = new Set(plan.strategy.instIds);
  if (strategyIds.size !== plan.strategy.instIds.length) throw new Error('plan.strategy.instIds contient des doublons.');
  if (strategyIds.size !== allowed.size || [...strategyIds].some((id) => !allowed.has(id))) {
    throw new Error('strategy.instIds et risk.allowedInstIds doivent être identiques.');
  }
  for (const instId of allowed) {
    if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(instId)) throw new Error(`Paire whitelist invalide : ${instId}.`);
  }

  const quoteSet = new Set([...allowed].map(quoteCurrency));
  if (quoteSet.size !== 1 || !quoteSet.has(plan.strategy.quoteCcy)) throw new Error('Toutes les paires doivent partager strategy.quoteCcy.');

  const ids = new Set();
  const operationIds = new Set();
  const clOrdIds = new Set();
  let plannedTotal = 0;
  for (const [idx, entry] of plan.entries.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`Entrée ${idx} invalide.`);
    if (!entry.id || typeof entry.id !== 'string') throw new Error(`Entrée ${idx} sans id.`);
    if (ids.has(entry.id)) throw new Error(`Identifiant d'entrée dupliqué : ${entry.id}.`);
    ids.add(entry.id);
    if (!KNOWN_ENTRY_STATUSES.has(entry.status)) throw new Error(`Statut inconnu pour ${entry.id} : ${entry.status}.`);
    if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(entry.instId || '')) throw new Error(`Paire invalide pour ${entry.id}.`);
    if (!allowed.has(entry.instId)) throw new Error(`Paire non autorisée par la whitelist : ${entry.instId}.`);
    const amount = finitePositive(entry.amount, `Montant de ${entry.id}`);
    if (amount > risk.maxOrderAmount) throw new Error(`Montant de ${entry.id} supérieur à risk.maxOrderAmount.`);
    plannedTotal += amount;
    validIsoDate(entry.dueAt, `dueAt de ${entry.id}`);
    if (entry.attempts !== undefined && (!Number.isInteger(Number(entry.attempts)) || Number(entry.attempts) < 0)) throw new Error(`attempts invalide pour ${entry.id}.`);

    const expectedOperationId = operationIdForEntry(entry, plan);
    const expectedClOrdId = deterministicClOrdId({ ...entry, operationId: expectedOperationId });
    if (entry.operationId !== undefined && entry.operationId !== expectedOperationId) throw new Error(`operationId incohérent pour ${entry.id}.`);
    if (entry.clOrdId !== undefined && entry.clOrdId !== expectedClOrdId) throw new Error(`clOrdId incohérent pour ${entry.id}.`);
    if (operationIds.has(expectedOperationId)) throw new Error(`operationId dupliqué : ${expectedOperationId}.`);
    if (clOrdIds.has(expectedClOrdId)) throw new Error(`clOrdId dupliqué : ${expectedClOrdId}.`);
    operationIds.add(expectedOperationId);
    clOrdIds.add(expectedClOrdId);
  }
  if (plannedTotal > risk.maxPlanQuoteAmount) throw new Error(`Le plan (${plannedTotal}) dépasse risk.maxPlanQuoteAmount (${risk.maxPlanQuoteAmount}).`);
  return risk;
}

export function isDue(entry, nowMs = Date.now(), risk = DEFAULT_RISK) {
  if (!['pending', 'failed'].includes(entry.status)) return false;
  const dueAt = new Date(entry.dueAt).getTime();
  if (!Number.isFinite(dueAt) || dueAt > nowMs) return false;
  if (entry.status === 'failed' && entry.retryable === false) return false;
  if ((entry.attempts || 0) >= risk.maxAttempts) return false;
  if (entry.retryAfter && new Date(entry.retryAfter).getTime() > nowMs) return false;
  return true;
}

export function classifyError(err) {
  if (err?.okxCode) {
    if (['51000', '51001', '51008', '51020', '51131', '51149', '51603', '51604', '51617'].includes(String(err.okxCode))) return { retryable: false, reason: `OKX définitif ${err.okxCode}` };
    if (['50000', '50001', '50011', '50102'].includes(String(err.okxCode))) return { retryable: true, reason: `OKX temporaire ${err.okxCode}` };
  }
  const message = String(err?.message || err || 'Erreur inconnue');
  const lower = message.toLowerCase();
  if (lower.includes('instrument id') || lower.includes("doesn't exist") || lower.includes('no market data') || lower.includes('local compliance restrictions') || lower.includes('pair') || lower.includes('format attendu') || lower.includes('whitelist')) return { retryable: false, reason: 'Erreur définitive de paire/marché' };
  if (lower.includes('invalid sign') || lower.includes("api key doesn't exist") || lower.includes('identifiants manquants') || lower.includes('passphrase')) return { retryable: false, reason: 'Erreur définitive de configuration API' };
  if (lower.includes('solde insuffisant') || lower.includes('timeout') || lower.includes('rate limit') || lower.includes('too many') || lower.includes('temporar') || lower.includes('network') || lower.includes('fetch failed') || lower.includes('response lost')) return { retryable: true, reason: 'Erreur temporaire ou ambiguë' };
  return { retryable: true, reason: 'Erreur non classée, retry limité' };
}

function operationExposure(op) {
  if (!op || op.state === 'prepared') return 0;
  if (op.state === 'terminal') {
    const executed = Number(op.executedQuoteAmount);
    if (Number.isFinite(executed) && executed >= 0) return executed;
    return op.terminalState === 'filled' ? Number(op.requestedQuoteAmount || 0) : 0;
  }
  return Number(op.requestedQuoteAmount || 0);
}

function accountingRows(history, operations, quote, demo, excludeOperationId) {
  const rows = [];
  const seen = new Set();
  const purchases = history?.purchases || [];
  const historyById = new Map();
  for (const purchase of purchases) {
    if (purchase.operationId) historyById.set(purchase.operationId, purchase);
    if (purchase.clOrdId) historyById.set(purchase.clOrdId, purchase);
  }
  for (const op of operations?.operations || []) {
    if (op.operationId === excludeOperationId || op.quoteCcy !== quote || (op.demo !== undefined && op.demo !== demo)) continue;
    const amount = operationExposure(op);
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Montant comptable invalide pour ${op.operationId}.`);
    if (amount === 0) continue;
    const historyMatch = historyById.get(op.operationId) || historyById.get(op.clOrdId);
    const at = op.state === 'terminal'
      ? (op.terminalAt || historyMatch?.executedAt || historyMatch?.terminalAt || op.dueAt)
      : (op.reservedAt || op.lastSubmitAt);
    rows.push({ amount, at, open: op.state !== 'terminal' });
    if (op.operationId) seen.add(`op:${op.operationId}`);
    if (op.clOrdId) seen.add(`cl:${op.clOrdId}`);
  }
  for (const purchase of purchases) {
    if (purchase.quoteCcy !== quote || (purchase.demo !== undefined && purchase.demo !== demo)) continue;
    if ((purchase.operationId && seen.has(`op:${purchase.operationId}`)) || (purchase.clOrdId && seen.has(`cl:${purchase.clOrdId}`))) continue;
    const amount = Number(purchase.executedQuoteAmount ?? purchase.amount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Montant historique invalide.');
    rows.push({ amount, at: purchase.executedAt || purchase.terminalAt, open: false });
  }
  return rows;
}

export function reservedOrExecutedToday(history, operations, quote, day, demo = true, excludeOperationId) {
  return accountingRows(history, operations, quote, demo, excludeOperationId)
    // Une exposition encore ouverte réserve le plafond de chaque nouveau jour
    // jusqu'à son état terminal, même si elle a été soumise avant minuit.
    .filter((row) => row.open || String(row.at || '').slice(0, 10) === day)
    .reduce((sum, row) => sum + row.amount, 0);
}

export function lifetimeExecuted(history, operations, quote, demo = true, excludeOperationId) {
  return accountingRows(history, operations, quote, demo, excludeOperationId).reduce((sum, row) => sum + row.amount, 0);
}

/** Preserve prior audited exposure when a new plan defines its lifetime cap. */
export function cumulativeLifetimeCap(history, operations, quote, demo, newPlanQuoteAmount) {
  const planned = finitePositive(newPlanQuoteAmount, 'Montant total du nouveau plan');
  return lifetimeExecuted(history, operations, quote, demo) + planned;
}

export function validateEntrySafety(entry, plan, history, risk = normalizeRisk(plan), now = new Date(), operations = { operations: [] }, currentOperationId) {
  const quote = quoteCurrency(entry.instId);
  const amount = finitePositive(entry.amount, `Montant de ${entry.id}`);
  const allowed = new Set(risk.allowedInstIds || []);
  if (!allowed.has(entry.instId)) throw new Error(`paire non autorisée par la whitelist : ${entry.instId}`);
  if (amount > risk.maxOrderAmount) throw new Error(`montant par ordre trop élevé : ${amount} > ${risk.maxOrderAmount}`);
  const day = now.toISOString().slice(0, 10);
  const alreadyToday = reservedOrExecutedToday(history, operations, quote, day, plan.demo, currentOperationId);
  if (alreadyToday + amount > risk.maxDailyQuoteAmount) throw new Error(`limite journalière dépassée : ${alreadyToday + amount} ${quote} > ${risk.maxDailyQuoteAmount} ${quote}`);
  const used = lifetimeExecuted(history, operations, quote, plan.demo, currentOperationId);
  if (used + amount > risk.maxLifetimeQuoteAmount) throw new Error(`limite de durée de vie dépassée : ${used + amount} ${quote} > ${risk.maxLifetimeQuoteAmount} ${quote}`);
}

export function markFailure(entry, err, risk = DEFAULT_RISK, now = new Date()) {
  const classification = classifyError(err);
  entry.status = 'failed';
  entry.error = String(err?.message || err);
  entry.errorClass = classification.reason;
  entry.retryable = classification.retryable;
  entry.failedAt = now.toISOString();
  entry.attempts = entry.attempts || 0;
  if (classification.retryable && entry.attempts < risk.maxAttempts) entry.retryAfter = new Date(now.getTime() + risk.retryDelayMinutes * 60_000).toISOString();
  else {
    delete entry.retryAfter;
    entry.retryable = false;
  }
}

export function addPurchaseIfMissing(history, purchase) {
  history.purchases ||= [];
  const exists = history.purchases.some((p) =>
    (purchase.operationId && p.operationId === purchase.operationId) ||
    (purchase.clOrdId && p.clOrdId === purchase.clOrdId)
  );
  if (!exists) history.purchases.push(purchase);
  return !exists;
}
