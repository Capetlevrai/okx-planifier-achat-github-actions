import crypto from 'node:crypto';
import { quoteCurrency } from './okx.mjs';

export const DEFAULT_RISK = {
  maxAttempts: 3,
  retryDelayMinutes: 60,
  orderPollAttempts: 10,
  orderPollDelayMs: 1500,
  allowedInstIds: [],
  maxOrderAmount: null,
  maxDailyQuoteAmount: null,
};

/**
 * clOrdId OKX déterministe : même échéance => même identifiant client.
 * Cela permet de retrouver un ordre déjà envoyé si GitHub Actions plante avant
 * d'avoir commit data/plan.json / data/history.json.
 */
export function deterministicClOrdId(entry, prefix = 'dca') {
  const source = `${entry.id}|${entry.instId}|${entry.dueAt}|${entry.amount}`;
  const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 20);
  return `${prefix}${hash}`.slice(0, 32);
}

export function normalizeRisk(plan) {
  return {
    ...DEFAULT_RISK,
    ...(plan.risk || {}),
    allowedInstIds: plan.risk?.allowedInstIds?.length ? plan.risk.allowedInstIds : plan.strategy?.instIds || [],
  };
}

export function isDue(entry, nowMs = Date.now(), risk = DEFAULT_RISK) {
  if (!['pending', 'failed'].includes(entry.status)) return false;
  if (new Date(entry.dueAt).getTime() > nowMs) return false;
  if (entry.status === 'failed' && entry.retryable === false) return false;
  if ((entry.attempts || 0) >= risk.maxAttempts) return false;
  if (entry.retryAfter && new Date(entry.retryAfter).getTime() > nowMs) return false;
  return true;
}

export function classifyError(err) {
  const message = String(err?.message || err || 'Erreur inconnue');
  const lower = message.toLowerCase();

  if (
    lower.includes('instrument id') ||
    lower.includes("doesn't exist") ||
    lower.includes('no market data') ||
    lower.includes('local compliance restrictions') ||
    lower.includes('pair') ||
    lower.includes('format attendu')
  ) {
    return { retryable: false, reason: 'Erreur définitive de paire/marché' };
  }

  if (
    lower.includes('invalid sign') ||
    lower.includes("api key doesn't exist") ||
    lower.includes('identifiants manquants') ||
    lower.includes('passphrase')
  ) {
    return { retryable: false, reason: 'Erreur définitive de configuration API' };
  }

  if (
    lower.includes('solde insuffisant') ||
    lower.includes('timeout') ||
    lower.includes('rate limit') ||
    lower.includes('too many') ||
    lower.includes('temporar') ||
    lower.includes('network') ||
    lower.includes('fetch failed')
  ) {
    return { retryable: true, reason: 'Erreur temporaire ou récupérable' };
  }

  return { retryable: true, reason: 'Erreur non classée, retry limité' };
}

export function validateEntrySafety(entry, plan, history, risk = normalizeRisk(plan), now = new Date()) {
  const quote = quoteCurrency(entry.instId);
  const allowed = new Set(risk.allowedInstIds || []);
  if (allowed.size && !allowed.has(entry.instId)) {
    throw new Error(`paire non autorisée par la whitelist : ${entry.instId}`);
  }

  if (risk.maxOrderAmount !== null && Number(entry.amount) > Number(risk.maxOrderAmount)) {
    throw new Error(`montant par ordre trop élevé : ${entry.amount} > ${risk.maxOrderAmount}`);
  }

  if (risk.maxDailyQuoteAmount !== null) {
    const day = now.toISOString().slice(0, 10);
    const already = (history.purchases || [])
      .filter((p) => p.quoteCcy === quote && String(p.executedAt || '').slice(0, 10) === day)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    if (already + Number(entry.amount) > Number(risk.maxDailyQuoteAmount)) {
      throw new Error(`limite journalière dépassée : ${already + Number(entry.amount)} ${quote} > ${risk.maxDailyQuoteAmount} ${quote}`);
    }
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
  if (classification.retryable && entry.attempts < risk.maxAttempts) {
    entry.retryAfter = new Date(now.getTime() + risk.retryDelayMinutes * 60_000).toISOString();
  } else {
    delete entry.retryAfter;
    entry.retryable = false;
  }
}

export function addPurchaseIfMissing(history, purchase) {
  history.purchases ||= [];
  const exists = history.purchases.some((p) => p.id === purchase.id || (purchase.clOrdId && p.clOrdId === purchase.clOrdId));
  if (!exists) history.purchases.push(purchase);
  return !exists;
}
