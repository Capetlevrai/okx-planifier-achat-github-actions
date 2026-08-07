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
  const time = new Date(value).getTime();
  if (typeof value !== 'string' || !Number.isFinite(time)) throw new Error(`${label} doit être une date ISO valide.`);
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
  if (!Number.isInteger(Number(risk.maxAttempts)) || Number(risk.maxAttempts) < 1 || Number(risk.maxAttempts) > 20) {
    throw new Error('risk.maxAttempts doit être un entier borné entre 1 et 20.');
  }
  risk.maxAttempts = Number(risk.maxAttempts);
  for (const key of ['retryDelayMinutes', 'orderPollAttempts', 'orderPollDelayMs']) {
    if (!Number.isInteger(Number(risk[key])) || Number(risk[key]) < 0) throw new Error(`risk.${key} doit être un entier positif.`);
    risk[key] = Number(risk[key]);
  }
  for (const key of ['maxOrderAmount', 'maxDailyQuoteAmount', 'maxPlanQuoteAmount', 'maxLifetimeQuoteAmount']) {
    if (risk[key] !== null && risk[key] !== undefined) risk[key] = finitePositive(risk[key], `risk.${key}`);
  }
  return risk;
}

export function validatePlanStrict(plan) {
  if (!plan || typeof plan !== 'object') throw new Error('plan.json absent ou invalide.');
  if (typeof plan.live !== 'boolean') throw new Error('plan.live doit être booléen.');
  if (typeof plan.demo !== 'boolean') throw new Error('plan.demo doit être booléen.');
  if (!SITES[plan.site]) throw new Error(`plan.site inconnu : ${plan.site}.`);
  if (plan.baseUrl && plan.baseUrl !== SITES[plan.site].baseUrl) throw new Error('plan.baseUrl ne correspond pas au site OKX autorisé.');
  if (!Array.isArray(plan.entries)) throw new Error('plan.entries doit être un tableau.');
  const risk = normalizeRisk(plan);
  const allowed = new Set(risk.allowedInstIds);
  for (const instId of allowed) {
    if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(instId)) throw new Error(`Paire whitelist invalide : ${instId}.`);
  }
  for (const [idx, entry] of plan.entries.entries()) {
    if (!entry || typeof entry !== 'object') throw new Error(`Entrée ${idx} invalide.`);
    if (!entry.id || typeof entry.id !== 'string') throw new Error(`Entrée ${idx} sans id.`);
    if (!KNOWN_ENTRY_STATUSES.has(entry.status)) throw new Error(`Statut inconnu pour ${entry.id} : ${entry.status}.`);
    if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(entry.instId || '')) throw new Error(`Paire invalide pour ${entry.id}.`);
    if (!allowed.has(entry.instId)) throw new Error(`Paire non autorisée par la whitelist : ${entry.instId}.`);
    finitePositive(entry.amount, `Montant de ${entry.id}`);
    validIsoDate(entry.dueAt, `dueAt de ${entry.id}`);
    if (entry.attempts !== undefined && (!Number.isInteger(Number(entry.attempts)) || Number(entry.attempts) < 0)) throw new Error(`attempts invalide pour ${entry.id}.`);
  }
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
  if (lower.includes('solde insuffisant') || lower.includes('timeout') || lower.includes('rate limit') || lower.includes('too many') || lower.includes('temporar') || lower.includes('network') || lower.includes('fetch failed')) return { retryable: true, reason: 'Erreur temporaire ou récupérable' };
  return { retryable: true, reason: 'Erreur non classée, retry limité' };
}

export function reservedOrExecutedToday(history, operations, quote, day) {
  const purchases = history.purchases || [];
  const fromHistory = purchases
    .filter((p) => p.quoteCcy === quote && String(p.executedAt || p.terminalAt || '').slice(0, 10) === day)
    .reduce((sum, p) => sum + Number(p.executedQuoteAmount ?? p.amount ?? 0), 0);
  const fromOpen = (operations.operations || [])
    .filter((op) => op.quoteCcy === quote && op.state !== 'terminal' && String(op.createdAt || '').slice(0, 10) === day)
    .reduce((sum, op) => sum + Number(op.requestedQuoteAmount || 0), 0);
  return fromHistory + fromOpen;
}

export function lifetimeExecuted(history, operations, quote) {
  const h = (history.purchases || []).filter((p) => p.quoteCcy === quote).reduce((s, p) => s + Number(p.executedQuoteAmount ?? p.amount ?? 0), 0);
  const open = (operations.operations || []).filter((op) => op.quoteCcy === quote && op.state !== 'terminal').reduce((s, op) => s + Number(op.requestedQuoteAmount || 0), 0);
  return h + open;
}

export function validateEntrySafety(entry, plan, history, risk = normalizeRisk(plan), now = new Date(), operations = { operations: [] }) {
  const quote = quoteCurrency(entry.instId);
  const amount = finitePositive(entry.amount, `Montant de ${entry.id}`);
  const allowed = new Set(risk.allowedInstIds || []);
  if (!allowed.has(entry.instId)) throw new Error(`paire non autorisée par la whitelist : ${entry.instId}`);
  if (risk.maxOrderAmount !== null && amount > risk.maxOrderAmount) throw new Error(`montant par ordre trop élevé : ${amount} > ${risk.maxOrderAmount}`);
  const day = now.toISOString().slice(0, 10);
  if (risk.maxDailyQuoteAmount !== null) {
    const already = reservedOrExecutedToday(history, operations, quote, day);
    if (already + amount > risk.maxDailyQuoteAmount) throw new Error(`limite journalière dépassée : ${already + amount} ${quote} > ${risk.maxDailyQuoteAmount} ${quote}`);
  }
  if (risk.maxPlanQuoteAmount !== null) {
    const planned = plan.entries.filter((e) => e.instId.endsWith(`-${quote}`)).reduce((sum, e) => sum + Number(e.amount || 0), 0);
    if (planned > risk.maxPlanQuoteAmount) throw new Error(`limite totale du plan dépassée : ${planned} ${quote} > ${risk.maxPlanQuoteAmount} ${quote}`);
  }
  if (risk.maxLifetimeQuoteAmount !== null) {
    const used = lifetimeExecuted(history, operations, quote);
    if (used + amount > risk.maxLifetimeQuoteAmount) throw new Error(`limite de durée de vie dépassée : ${used + amount} ${quote} > ${risk.maxLifetimeQuoteAmount} ${quote}`);
  }
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
