import assert from 'node:assert/strict';
import { runPlanner } from '../scripts/engine.mjs';

const T0 = new Date('2026-08-07T10:00:00Z');
const T1 = new Date('2026-08-08T10:01:00Z');

function makeEntry(id, dueAt = '2026-08-07T09:00:00Z', amount = 50, status = 'pending') {
  return { id, dueAt, instId: 'BTC-USDC', amount, status, attempts: 0 };
}

function basePlan({ entries = [makeEntry('dca-1-BTC-USDC')], demo = true, live = true, risk = {} } = {}) {
  const maxAmount = Math.max(...entries.map((entry) => Number(entry.amount)));
  const planned = entries.reduce((sum, entry) => sum + Number(entry.amount), 0);
  return {
    createdAt: '2026-08-07T00:00:00Z',
    live,
    demo,
    site: 'eea',
    baseUrl: 'https://my.okx.com',
    strategy: { instIds: ['BTC-USDC'], quoteCcy: 'USDC', amountPerAsset: maxAmount, everyDays: 1, cycles: entries.length, hourUtc: 9 },
    risk: {
      allowedInstIds: ['BTC-USDC'],
      maxOrderAmount: maxAmount,
      maxDailyQuoteAmount: Math.max(planned, maxAmount),
      maxPlanQuoteAmount: planned,
      maxLifetimeQuoteAmount: planned,
      maxAttempts: 3,
      retryDelayMinutes: 60,
      orderPollAttempts: 1,
      orderPollDelayMs: 0,
      ...risk,
    },
    entries,
  };
}

class FakeOkx {
  constructor() {
    this.orders = new Map();
    this.postCalls = 0;
    this.balanceCalls = 0;
    this.priceCalls = 0;
    this.findCalls = 0;
    this.postMode = 'filled';
    this.hideFindCount = 0;
    this.balance = 1000;
  }
  async lastPrice() { this.priceCalls += 1; return 100; }
  async availableBalance() { this.balanceCalls += 1; return this.balance; }
  async findOrderByClOrdId(instId, clOrdId) {
    this.findCalls += 1;
    if (this.hideFindCount > 0) { this.hideFindCount -= 1; return null; }
    return this.orders.get(clOrdId) || null;
  }
  async marketBuy(instId, amount, clOrdId) {
    this.postCalls += 1;
    const existing = this.orders.get(clOrdId);
    if (existing) return { ordId: existing.ordId, clOrdId, state: existing.state };
    if (this.postMode === 'fail-before-accept') {
      this.postMode = 'filled';
      throw new Error('network failed before POST acceptance');
    }
    if (this.postMode === 'item-reject') {
      const error = new Error('OKX item rejection');
      error.okxCode = '51000';
      throw error;
    }
    const order = {
      ordId: `ord-${this.orders.size + 1}`,
      clOrdId,
      instId,
      state: 'filled',
      accFillSz: String(amount / 100),
      avgPx: '100',
      fee: '0',
      feeCcy: 'BTC',
      accFillQuote: String(amount),
      cTime: T0.toISOString(),
      uTime: T0.toISOString(),
    };
    if (this.postMode === 'live') order.state = 'live';
    if (this.postMode === 'partial-open') { order.state = 'partially_filled'; order.accFillSz = String(amount / 200); order.accFillQuote = String(amount / 2); }
    if (this.postMode === 'canceled-partial') { order.state = 'canceled'; order.accFillSz = String(amount / 200); order.accFillQuote = String(amount / 2); }
    if (this.postMode === 'rejected') { order.state = 'rejected'; order.accFillSz = '0'; order.accFillQuote = '0'; }
    if (this.postMode === 'malformed-filled') { order.state = 'filled'; order.accFillSz = '0'; order.avgPx = '0'; delete order.accFillQuote; }
    this.orders.set(clOrdId, order);
    if (this.postMode === 'lost-after-accept') {
      this.postMode = 'filled';
      throw new Error('network response lost after POST');
    }
    return { ordId: order.ordId, clOrdId, state: order.state };
  }
}

async function runState(state, api, now = T0, options = {}) {
  state.saves ||= 0;
  const result = await runPlanner({
    plan: state.plan,
    history: state.history,
    operations: state.operations,
    client: api,
    now,
    dryRun: options.dryRun ?? false,
    demo: options.demo ?? state.plan.demo,
    realTradingArmed: options.realTradingArmed ?? false,
    persist: async ({ plan, history, operations }) => {
      state.saves += 1;
      state.plan = structuredClone(plan);
      state.history = structuredClone(history);
      state.operations = structuredClone(operations);
    },
  });
  return result;
}

// Happy path: exactly one remote order and one audit row.
{
  const api = new FakeOkx();
  const state = { plan: basePlan(), history: { purchases: [] }, operations: { operations: [] } };
  const result = await runState(state, api);
  assert.deepEqual(result.failures, []);
  assert.equal(api.orders.size, 1);
  assert.equal(api.postCalls, 1);
  assert.equal(state.history.purchases.length, 1);
  assert.equal(state.operations.operations[0].state, 'terminal');
}

// POST accepted, response lost: replay reconciles before any second POST.
{
  const api = new FakeOkx();
  api.postMode = 'lost-after-accept';
  const state = { plan: basePlan(), history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api);
  assert.equal(api.orders.size, 1);
  assert.equal(state.operations.operations[0].state, 'submitting');
  await runState(state, api, T1);
  assert.equal(api.orders.size, 1);
  assert.equal(api.postCalls, 1, 'accepted order must be found without a second POST');
  assert.equal(state.history.purchases.length, 1);
}

// Any transport failure around POST is ambiguous: never retransmit automatically,
// even when the fake server says it failed before acceptance.
{
  const api = new FakeOkx();
  api.postMode = 'fail-before-accept';
  const state = { plan: basePlan(), history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api);
  const clOrdId = state.operations.operations[0].clOrdId;
  assert.equal(api.orders.size, 0);
  const replay = await runState(state, api, T1);
  assert.equal(api.orders.size, 0);
  assert.equal(api.postCalls, 1, 'ambiguous transport failure must remain GET-only');
  assert.equal(state.operations.operations[0].clOrdId, clOrdId);
  assert.equal(state.history.purchases.length, 0);
  assert.match(replay.failures.join('\n'), /réconciliation/);
}

// Accepted order temporarily hidden from lookup: no automatic resubmit. A later
// run reconciles the original remote order.
{
  const api = new FakeOkx();
  api.postMode = 'lost-after-accept';
  const state = { plan: basePlan(), history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api);
  api.hideFindCount = 1;
  await runState(state, api, T1);
  assert.equal(api.postCalls, 1);
  assert.equal(api.orders.size, 1);
  assert.equal(state.history.purchases.length, 0);
  await runState(state, api, new Date('2026-08-09T10:01:00Z'));
  assert.equal(api.postCalls, 1);
  assert.equal(state.history.purchases.length, 1);
}

// An unknown remote state is never interpreted as permission to POST again.
{
  const api = new FakeOkx();
  api.postMode = 'live';
  const state = { plan: basePlan(), history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api);
  const remote = [...api.orders.values()][0];
  remote.state = 'exchange_new_state';
  await runState(state, api, T1);
  assert.equal(api.postCalls, 1);
  assert.equal(state.operations.operations[0].state, 'reconcile_pending');
}

// Reconciliation precedes current balance/caps and never creates a new POST.
{
  const api = new FakeOkx();
  const plan = basePlan({ risk: { maxDailyQuoteAmount: 50, maxLifetimeQuoteAmount: 50 } });
  const state = { plan, history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api);
  state.history = { purchases: [] }; // simule perte de projection après persistance canonique du registre
  api.balanceCalls = 0;
  await runState(state, api, T1);
  assert.equal(api.balanceCalls, 0);
  assert.equal(api.postCalls, 1);
  assert.equal(state.history.purchases.length, 1, 'terminal registry rebuilds a missing history projection');
}

// Future prepared operations do not reserve today's or lifetime cap.
{
  const api = new FakeOkx();
  const entries = [makeEntry('first'), makeEntry('future', '2026-08-08T09:00:00Z')];
  const plan = basePlan({ entries, risk: { maxDailyQuoteAmount: 50, maxLifetimeQuoteAmount: 100 } });
  const state = { plan, history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api);
  assert.equal(api.postCalls, 1);
  assert.equal(state.operations.operations.filter((op) => op.state === 'prepared').length, 1);
}

// Two due operations enforce the aggregate daily cap in the same run.
{
  const api = new FakeOkx();
  const entries = [makeEntry('first', undefined, 60), makeEntry('second', undefined, 60)];
  const plan = basePlan({ entries, risk: { maxOrderAmount: 60, maxDailyQuoteAmount: 100, maxPlanQuoteAmount: 120, maxLifetimeQuoteAmount: 120 } });
  const state = { plan, history: { purchases: [] }, operations: { operations: [] } };
  const result = await runState(state, api);
  assert.equal(api.postCalls, 1);
  assert.match(result.failures.join('\n'), /limite journalière/);
}

// An ambiguous exposure from yesterday reserves today's cap until terminal.
{
  const api = new FakeOkx();
  api.postMode = 'live';
  const entries = [makeEntry('yesterday', undefined, 60), makeEntry('today', '2026-08-08T09:00:00Z', 60)];
  const plan = basePlan({ entries, risk: { maxOrderAmount: 60, maxDailyQuoteAmount: 100, maxPlanQuoteAmount: 120, maxLifetimeQuoteAmount: 120 } });
  const state = { plan, history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api, T0);
  const result = await runState(state, api, T1);
  assert.equal(api.postCalls, 1, 'open prior-day exposure must block a new order above the daily cap');
  assert.match(result.failures.join('\n'), /limite journalière|réconciliation/);
}

// Lifetime cap survives presentation history reset because operations is canonical.
{
  const api = new FakeOkx();
  const entries = [makeEntry('first'), makeEntry('second', '2026-08-08T09:00:00Z')];
  const plan = basePlan({ entries, risk: { maxDailyQuoteAmount: 100, maxLifetimeQuoteAmount: 75 } });
  const state = { plan, history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api, T0);
  state.history = { purchases: [] };
  const result = await runState(state, api, T1);
  assert.equal(api.postCalls, 1);
  assert.match(result.failures.join('\n'), /limite de durée de vie/);
}

// Open/partial/terminal states never cause a duplicate replay; problematic terminals fail the run.
for (const [mode, expectedState, expectedHistoryStatus] of [
  ['live', 'reconcile_pending', undefined],
  ['partial-open', 'reconcile_pending', undefined],
  ['malformed-filled', 'reconcile_pending', undefined],
  ['canceled-partial', 'terminal', 'partial'],
  ['rejected', 'terminal', 'rejected'],
]) {
  const api = new FakeOkx();
  api.postMode = mode;
  const state = { plan: basePlan(), history: { purchases: [] }, operations: { operations: [] } };
  const result = await runState(state, api);
  assert.equal(state.operations.operations[0].state, expectedState, `${mode} state`);
  assert.ok(result.failures.length > 0, `${mode} must make the orchestration non-green`);
  if (expectedHistoryStatus) assert.equal(state.history.purchases[0].status, expectedHistoryStatus, `${mode} history status`);
  await runState(state, api, T1);
  assert.equal(api.orders.size, 1, `${mode} must retain one remote order`);
}

// Per-item definitive rejection becomes a terminal zero-fill audit and is never retried.
{
  const api = new FakeOkx();
  api.postMode = 'item-reject';
  const state = { plan: basePlan(), history: { purchases: [] }, operations: { operations: [] } };
  const result = await runState(state, api);
  assert.match(result.failures.join('\n'), /item rejection/);
  assert.equal(state.operations.operations[0].terminalState, 'rejected');
  assert.equal(state.history.purchases[0].status, 'rejected');
  await runState(state, api, T1);
  assert.equal(api.postCalls, 1);
}

// A disarmed real account permits reconciliation but blocks every new POST.
{
  const api = new FakeOkx();
  const state = { plan: basePlan({ demo: false }), history: { purchases: [] }, operations: { operations: [] } };
  const result = await runState(state, api, T0, { demo: false, realTradingArmed: false });
  assert.equal(api.findCalls, 1, 'read-only lookup remains available for safe reconciliation');
  assert.equal(api.priceCalls + api.balanceCalls + api.postCalls, 0);
  assert.match(result.failures.join('\n'), /soumissions désarmées/);
}

// A disarmed real dry-run performs the authenticated preflight but cannot POST.
{
  const api = new FakeOkx();
  const state = { plan: basePlan({ demo: false, live: false }), history: { purchases: [] }, operations: { operations: [] } };
  const result = await runState(state, api, T0, { demo: false, realTradingArmed: false, dryRun: true });
  assert.deepEqual(result.failures, []);
  assert.equal(api.findCalls, 1, 'dry-run keeps the deterministic order lookup');
  assert.equal(api.priceCalls, 1, 'dry-run validates the live market price');
  assert.equal(api.balanceCalls, 1, 'dry-run validates the live Trading balance');
  assert.equal(api.postCalls, 0, 'dry-run must never submit an order');
  assert.equal(state.operations.operations[0].state, 'prepared');
  assert.equal(state.history.purchases.length, 0);
}

// Removing the real-money arming secret is a kill switch for POST, not for
// durable reconciliation of an operation accepted before disarming.
{
  const api = new FakeOkx();
  api.postMode = 'lost-after-accept';
  const state = { plan: basePlan({ demo: false }), history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api, T0, { demo: false, realTradingArmed: true });
  assert.equal(state.operations.operations[0].state, 'submitting');
  await runState(state, api, T1, { demo: false, realTradingArmed: false, dryRun: true });
  assert.equal(api.postCalls, 1);
  assert.equal(state.operations.operations[0].state, 'terminal');
  assert.equal(state.history.purchases.length, 1);
}

// The same operation registry can never cross from real to demo or vice versa.
{
  const api = new FakeOkx();
  const state = { plan: basePlan({ demo: false }), history: { purchases: [] }, operations: { operations: [] } };
  await assert.rejects(() => runState(state, api, T0, { demo: true, realTradingArmed: false }), /mode de compte effectif/);
  assert.equal(api.findCalls + api.priceCalls + api.balanceCalls + api.postCalls, 0);
}

// Strict validation stops invalid amounts before fake API calls.
{
  const api = new FakeOkx();
  const bad = basePlan({ entries: [makeEntry('bad', undefined, Number.NaN)] });
  const state = { plan: bad, history: { purchases: [] }, operations: { operations: [] } };
  await assert.rejects(() => runState(state, api), /strictement positif/);
  assert.equal(api.findCalls + api.priceCalls + api.balanceCalls + api.postCalls, 0);
}

console.log('orchestration fake API tests OK');
