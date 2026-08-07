import assert from 'node:assert/strict';
import {
  deterministicClOrdId, isDue, classifyError, validateEntrySafety,
  markFailure, addPurchaseIfMissing, normalizeRisk,
} from '../scripts/safety.mjs';

const now = new Date('2026-08-07T10:00:00Z');
const entry = {
  id: 'dca-1-BTC-USDC',
  dueAt: '2026-08-07T09:00:00Z',
  instId: 'BTC-USDC',
  amount: 50,
  status: 'pending',
};

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
assert.equal(classifyError(new Error('solde insuffisant : 0 USDC disponible')).retryable, true);

const plan = {
  strategy: { instIds: ['BTC-USDC', 'ETH-USDC'] },
  risk: { allowedInstIds: ['BTC-USDC', 'ETH-USDC'], maxOrderAmount: 50, maxDailyQuoteAmount: 100 },
};
const history = { purchases: [{ id: 'old', instId: 'BTC-USDC', quoteCcy: 'USDC', amount: 50, executedAt: '2026-08-07T08:00:00Z' }] };
validateEntrySafety(entry, plan, history, normalizeRisk(plan), now);
assert.throws(() => validateEntrySafety({ ...entry, instId: 'SOL-USDC' }, plan, history, normalizeRisk(plan), now), /whitelist/);
assert.throws(() => validateEntrySafety({ ...entry, amount: 51 }, plan, history, normalizeRisk(plan), now), /montant par ordre/);
assert.throws(() => validateEntrySafety({ ...entry, instId: 'ETH-USDC', amount: 51 }, { ...plan, risk: { ...plan.risk, maxOrderAmount: 100 } }, history, normalizeRisk({ ...plan, risk: { ...plan.risk, maxOrderAmount: 100 } }), now), /limite journalière/);

const failed = { ...entry };
markFailure(failed, new Error('solde insuffisant : 0 USDC disponible'), { maxAttempts: 3, retryDelayMinutes: 60 }, now);
assert.equal(failed.status, 'failed');
assert.equal(failed.retryable, true);
assert.equal(failed.attempts, 1);
assert.equal(failed.retryAfter, '2026-08-07T11:00:00.000Z');

const hist = { purchases: [] };
assert.equal(addPurchaseIfMissing(hist, { id: 'a', clOrdId: 'x' }), true);
assert.equal(addPurchaseIfMissing(hist, { id: 'a', clOrdId: 'x' }), false);
assert.equal(hist.purchases.length, 1);

console.log('safety tests OK');
