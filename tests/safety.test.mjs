import assert from 'node:assert/strict';
import {
  deterministicClOrdId, isDue, classifyError, validateEntrySafety,
  markFailure, addPurchaseIfMissing, normalizeRisk, validatePlanStrict,
} from '../scripts/safety.mjs';

const now = new Date('2026-08-07T10:00:00Z');
const entry = { id: 'dca-1-BTC-USDC', dueAt: '2026-08-07T09:00:00Z', instId: 'BTC-USDC', amount: 50, status: 'pending' };
const cl1 = deterministicClOrdId(entry);
const cl2 = deterministicClOrdId({ ...entry });
assert.equal(cl1, cl2, 'clOrdId must be deterministic for the same due entry');
assert.match(cl1, /^[A-Za-z0-9]{1,32}$/);

const risk = { maxAttempts: 3, retryDelayMinutes: 60 };
assert.equal(isDue(entry, now.getTime(), risk), true);
assert.equal(isDue({ ...entry, status: 'done' }, now.getTime(), risk), false);
assert.equal(isDue({ ...entry, status: 'failed', retryable: false }, now.getTime(), risk), false);
assert.equal(isDue({ ...entry, status: 'failed', retryable: true, attempts: 1, retryAfter: '2026-08-07T09:30:00Z' }, now.getTime(), risk), true);
assert.equal(isDue({ ...entry, status: 'failed', retryable: true, attempts: 3 }, now.getTime(), risk), false);

assert.equal(classifyError(new Error('No market data available')).retryable, false);
assert.equal(classifyError(Object.assign(new Error('item reject'), { okxCode: '51000' })).retryable, false);
assert.equal(classifyError(new Error('solde insuffisant : 0 USDC disponible')).retryable, true);

const plan = {
  createdAt: '2026-08-07T00:00:00Z', live: false, demo: true, site: 'eea', baseUrl: 'https://my.okx.com',
  strategy: { instIds: ['BTC-USDC', 'ETH-USDC'], quoteCcy: 'USDC' },
  risk: { allowedInstIds: ['BTC-USDC', 'ETH-USDC'], maxOrderAmount: 50, maxDailyQuoteAmount: 150, maxAttempts: 3, retryDelayMinutes: 60, orderPollAttempts: 1, orderPollDelayMs: 0 },
  entries: [entry],
};
const history = { purchases: [{ operationId: 'oldop', id: 'old', instId: 'BTC-USDC', quoteCcy: 'USDC', amount: 50, executedAt: '2026-08-07T08:00:00Z' }] };
const normalized = normalizeRisk(plan);
validatePlanStrict(plan);
validateEntrySafety(entry, plan, history, normalized, now, { operations: [] });
assert.throws(() => validateEntrySafety({ ...entry, instId: 'SOL-USDC' }, plan, history, normalized, now), /whitelist/);
assert.throws(() => validateEntrySafety({ ...entry, amount: 51 }, plan, history, normalized, now), /montant par ordre/);
assert.throws(() => validateEntrySafety(entry, { ...plan, risk: { ...plan.risk, maxDailyQuoteAmount: 90 } }, history, normalizeRisk({ ...plan, risk: { ...plan.risk, maxDailyQuoteAmount: 90 } }), now), /limite journalière/);
assert.throws(() => validateEntrySafety({ ...entry, amount: -1 }, plan, history, normalized, now), /strictement positif/);
assert.throws(() => validateEntrySafety({ ...entry, amount: Number.NaN }, plan, history, normalized, now), /strictement positif/);
assert.throws(() => validatePlanStrict({ ...plan, entries: [{ ...entry, dueAt: 'not-a-date' }] }), /date ISO/);
assert.throws(() => normalizeRisk({ ...plan, risk: { ...plan.risk, allowedInstIds: [] }, strategy: { instIds: [] } }), /whitelist non vide/);

const failed = { ...entry, attempts: 1 };
markFailure(failed, new Error('solde insuffisant : 0 USDC disponible'), { maxAttempts: 3, retryDelayMinutes: 60 }, now);
assert.equal(failed.status, 'failed');
assert.equal(failed.retryable, true);
assert.equal(failed.attempts, 1, 'markFailure must not increment attempts a second time');
assert.equal(failed.retryAfter, '2026-08-07T11:00:00.000Z');

const hist = { purchases: [] };
assert.equal(addPurchaseIfMissing(hist, { id: 'a', operationId: 'op1', clOrdId: 'x' }), true);
assert.equal(addPurchaseIfMissing(hist, { id: 'a', operationId: 'op2', clOrdId: 'y' }), true, 'reused presentation ids must not suppress new operations');
assert.equal(addPurchaseIfMissing(hist, { id: 'z', operationId: 'op2', clOrdId: 'y' }), false);
assert.equal(hist.purchases.length, 2);

console.log('safety tests OK');
