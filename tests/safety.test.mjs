import assert from 'node:assert/strict';
import {
  addPurchaseIfMissing,
  classifyError,
  cumulativeLifetimeCap,
  deterministicClOrdId,
  isDue,
  lifetimeExecuted,
  markFailure,
  normalizeRisk,
  operationIdForEntry,
  reservedOrExecutedToday,
  validateEntrySafety,
  validatePlanStrict,
} from '../scripts/safety.mjs';

const now = new Date('2026-08-07T10:00:00Z');
const entry = { id: 'dca-1-BTC-USDC', dueAt: '2026-08-07T09:00:00Z', instId: 'BTC-USDC', amount: 50, status: 'pending' };
function planWith(entries = [entry], riskOverrides = {}) {
  return {
    createdAt: '2026-08-07T00:00:00Z',
    live: false,
    demo: true,
    site: 'eea',
    baseUrl: 'https://my.okx.com',
    strategy: { instIds: ['BTC-USDC'], quoteCcy: 'USDC', amountPerAsset: 50, everyDays: 1, cycles: entries.length, hourUtc: 9 },
    risk: {
      allowedInstIds: ['BTC-USDC'],
      maxOrderAmount: 50,
      maxDailyQuoteAmount: 100,
      maxPlanQuoteAmount: 1000,
      maxLifetimeQuoteAmount: 1000,
      maxAttempts: 3,
      retryDelayMinutes: 60,
      orderPollAttempts: 1,
      orderPollDelayMs: 0,
      ...riskOverrides,
    },
    entries,
  };
}

const plan = planWith();
const operationId = operationIdForEntry(entry, plan);
const cl1 = deterministicClOrdId({ ...entry, operationId });
const cl2 = deterministicClOrdId({ ...entry, operationId });
assert.equal(cl1, cl2, 'clOrdId must be deterministic for the same logical operation');
assert.match(cl1, /^[A-Za-z0-9]{1,32}$/);

const risk = normalizeRisk(plan);
validatePlanStrict(plan);
assert.equal(isDue(entry, now.getTime(), risk), true);
assert.equal(isDue({ ...entry, status: 'done' }, now.getTime(), risk), false);
assert.equal(isDue({ ...entry, status: 'failed', retryable: false }, now.getTime(), risk), false);
assert.equal(isDue({ ...entry, status: 'failed', retryable: true, attempts: 3 }, now.getTime(), risk), false);

assert.equal(classifyError(new Error('No market data available')).retryable, false);
assert.equal(classifyError(Object.assign(new Error('item reject'), { okxCode: '51000' })).retryable, false);
assert.equal(classifyError(new Error('solde insuffisant : 0 USDC disponible')).retryable, true);

const history = { purchases: [{ operationId: 'oldop', id: 'old', instId: 'BTC-USDC', quoteCcy: 'USDC', demo: true, amount: 25, executedAt: '2026-08-07T08:00:00Z' }] };
validateEntrySafety(entry, plan, history, risk, now, { operations: [] });
assert.throws(() => validateEntrySafety({ ...entry, instId: 'SOL-USDC' }, plan, history, risk, now), /whitelist/);
assert.throws(() => validateEntrySafety({ ...entry, amount: -1 }, plan, history, risk, now), /strictement positif/);
assert.throws(() => validateEntrySafety({ ...entry, amount: Number.NaN }, plan, history, risk, now), /strictement positif/);
assert.throws(() => validatePlanStrict({ ...plan, entries: [{ ...entry, dueAt: 'not-a-date' }] }), /date ISO/);
assert.throws(() => validatePlanStrict({ ...plan, createdAt: '2026-02-30T00:00:00Z' }), /date impossible/);
assert.throws(() => validatePlanStrict({ ...plan, createdAt: '2026-01-01T00:00:00+01:00' }), /date ISO UTC/);
assert.throws(() => validatePlanStrict({ ...plan, entries: [entry, { ...entry }] }), /dupliqué/);
assert.throws(() => validatePlanStrict({ ...plan, entries: [{ ...entry, operationId: 'op_000000000000000000000000' }] }), /operationId incohérent/);
assert.throws(() => normalizeRisk({ ...plan, risk: { ...plan.risk, allowedInstIds: [] }, strategy: { ...plan.strategy, instIds: [] } }), /whitelist non vide/);
assert.throws(() => validatePlanStrict(planWith([entry], { maxPlanQuoteAmount: 40 })), /dépasse risk.maxPlanQuoteAmount/);

const prepared = {
  operationId,
  clOrdId: cl1,
  quoteCcy: 'USDC',
  requestedQuoteAmount: 50,
  state: 'prepared',
  createdAt: now.toISOString(),
  demo: true,
};
assert.equal(reservedOrExecutedToday({ purchases: [] }, { operations: [prepared] }, 'USDC', '2026-08-07', true), 0, 'future/prepared operations must not consume the daily cap');
assert.equal(lifetimeExecuted({ purchases: [] }, { operations: [prepared] }, 'USDC', true), 0, 'prepared operations must not consume lifetime cap');

const terminal = {
  ...prepared,
  state: 'terminal',
  terminalState: 'filled',
  executedQuoteAmount: 50,
  terminalAt: now.toISOString(),
};
assert.equal(lifetimeExecuted({ purchases: [] }, { operations: [terminal] }, 'USDC', true), 50, 'terminal registry remains canonical after presentation history reset');
const duplicateHistory = { purchases: [{ operationId, clOrdId: cl1, quoteCcy: 'USDC', demo: true, executedQuoteAmount: 50, executedAt: now.toISOString() }] };
assert.equal(lifetimeExecuted(duplicateHistory, { operations: [terminal] }, 'USDC', true), 50, 'registry and history must not be double-counted');
assert.equal(
  cumulativeLifetimeCap(duplicateHistory, { operations: [terminal] }, 'USDC', true, 100),
  150,
  'a replacement plan must add its budget to prior audited exposure instead of blocking its first order',
);

const failed = { ...entry, attempts: 1 };
markFailure(failed, new Error('solde insuffisant : 0 USDC disponible'), risk, now);
assert.equal(failed.status, 'failed');
assert.equal(failed.retryable, true);
assert.equal(failed.attempts, 1, 'markFailure must not increment submission attempts');
assert.equal(failed.retryAfter, '2026-08-07T11:00:00.000Z');

const hist = { purchases: [] };
assert.equal(addPurchaseIfMissing(hist, { id: 'a', operationId: 'op1', clOrdId: 'x' }), true);
assert.equal(addPurchaseIfMissing(hist, { id: 'a', operationId: 'op2', clOrdId: 'y' }), true, 'reused presentation ids must not suppress new operations');
assert.equal(addPurchaseIfMissing(hist, { id: 'z', operationId: 'op2', clOrdId: 'y' }), false);
assert.equal(hist.purchases.length, 2);

console.log('safety tests OK');
