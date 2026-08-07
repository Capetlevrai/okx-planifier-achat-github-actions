import assert from 'node:assert/strict';
import { runPlanner } from '../scripts/engine.mjs';

const now = new Date('2026-08-07T10:00:00Z');
function basePlan(overrides = {}) {
  return {
    createdAt: '2026-08-07T00:00:00Z', live: true, demo: true, site: 'eea', baseUrl: 'https://my.okx.com',
    strategy: { instIds: ['BTC-USDC'], quoteCcy: 'USDC', amountPerAsset: 50, everyDays: 1, cycles: 1, hourUtc: 9 },
    risk: { allowedInstIds: ['BTC-USDC'], maxOrderAmount: 50, maxDailyQuoteAmount: 100, maxPlanQuoteAmount: 1000, maxLifetimeQuoteAmount: 1000, maxAttempts: 2, retryDelayMinutes: 60, orderPollAttempts: 1, orderPollDelayMs: 0 },
    entries: [{ id: 'dca-1-BTC-USDC', dueAt: '2026-08-07T09:00:00Z', instId: 'BTC-USDC', amount: 50, status: 'pending', attempts: 0 }],
    ...overrides,
  };
}

class FakeOkx {
  constructor() { this.orders = new Map(); this.posts = 0; this.balanceCalls = 0; this.priceCalls = 0; this.postMode = 'ok'; }
  async lastPrice() { this.priceCalls++; return 100; }
  async availableBalance() { this.balanceCalls++; return 1000; }
  async findOrderByClOrdId(instId, clOrdId) { return this.orders.get(clOrdId) || null; }
  async marketBuy(instId, amount, clOrdId) {
    this.posts++;
    const order = { ordId: `ord-${this.posts}`, clOrdId, instId, state: 'filled', accFillSz: '0.5', avgPx: '100', fee: '0', feeCcy: 'BTC', accFillQuote: String(amount) };
    this.orders.set(clOrdId, order);
    if (this.postMode === 'lost') throw new Error('network response lost after POST');
    if (this.postMode === 'live') order.state = 'live';
    if (this.postMode === 'partial-open') { order.state = 'partially_filled'; order.accFillSz = '0.25'; order.accFillQuote = '25'; }
    if (this.postMode === 'canceled-partial') { order.state = 'canceled'; order.accFillSz = '0.25'; order.accFillQuote = '25'; }
    if (this.postMode === 'rejected') { order.state = 'rejected'; order.accFillSz = '0'; order.accFillQuote = '0'; }
    return { ordId: order.ordId, clOrdId, state: order.state };
  }
}

async function runState(state, api) {
  state.saves ||= 0;
  return runPlanner({
    plan: state.plan,
    history: state.history,
    operations: state.operations,
    client: api,
    now,
    dryRun: false,
    demo: true,
    persist: async ({ plan, history, operations }) => {
      state.saves++;
      state.plan = structuredClone(plan);
      state.history = structuredClone(history);
      state.operations = structuredClone(operations);
    },
  });
}

{
  const api = new FakeOkx();
  api.postMode = 'lost';
  const state = { plan: basePlan(), history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api);
  assert.equal(api.posts, 1, 'POST must have happened once before response loss');
  assert.equal(state.operations.operations[0].state, 'submitting', 'state saved before POST lets replay reconcile an ambiguous submission');
  assert.equal(state.history.purchases.length, 0);
  await runState(state, api);
  assert.equal(state.operations.operations[0].state, 'terminal', 'lost POST response is reconciled from the fake exchange on replay');
  assert.equal(api.posts, 1, 'replay must not submit a second POST');
  assert.equal(state.history.purchases.length, 1, 'replay must keep one audit row');
}

{
  const api = new FakeOkx();
  const state = { plan: basePlan(), history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api);
  const snapshot = structuredClone(state.operations.operations[0]);
  snapshot.state = 'submitting';
  state.operations.operations[0] = snapshot; // simule crash après sauvegarde pré-POST puis réponse POST perdue
  await runState(state, api);
  assert.equal(api.posts, 1);
  assert.equal(state.history.purchases.length, 1);
}

{
  const api = new FakeOkx();
  const state = { plan: basePlan({ risk: { ...basePlan().risk, maxDailyQuoteAmount: 40 } }), history: { purchases: [] }, operations: { operations: [] } };
  const existing = { ordId: 'remote-1', clOrdId: 'known', instId: 'BTC-USDC', state: 'filled', accFillSz: '0.5', avgPx: '100', accFillQuote: '50' };
  state.operations.operations = [{ operationId: 'old-op', entryId: 'old-entry', instId: 'BTC-USDC', quoteCcy: 'USDC', baseCcy: 'BTC', requestedQuoteAmount: 50, dueAt: now.toISOString(), clOrdId: 'known', state: 'reconcile_pending', submissionAttempts: 2, reconciliationAttempts: 0, preflightFailures: 0, events: [], createdAt: now.toISOString() }];
  api.orders.set('known', existing);
  await runState(state, api);
  assert.equal(api.balanceCalls, 0, 'reconciliation must happen before balance/preflight');
  assert.equal(api.posts, 0, 'maxAttempts/daily cap must not block reconciliation or cause POST');
  assert.equal(state.history.purchases.length, 1);
}

for (const [mode, expectedState, expectedHistoryStatus] of [['live', 'reconcile_pending', undefined], ['partial-open', 'reconcile_pending', undefined], ['canceled-partial', 'terminal', 'partial'], ['rejected', 'terminal', 'rejected']]) {
  const api = new FakeOkx();
  api.postMode = mode;
  const state = { plan: basePlan(), history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api);
  assert.equal(state.operations.operations[0].state, expectedState, `${mode} state`);
  if (expectedHistoryStatus) assert.equal(state.history.purchases[0].status, expectedHistoryStatus, `${mode} history status`);
  await runState(state, api);
  assert.equal(api.posts, 1, `${mode} must not be reposted on replay`);
}

{
  const api = new FakeOkx();
  const state = { plan: basePlan(), history: { purchases: [] }, operations: { operations: [] } };
  await runState(state, api);
  assert.equal(state.operations.operations[0].submissionAttempts, 1);
  assert.ok(state.operations.operations[0].reconciliationAttempts >= 1);
  assert.ok(state.operations.operations[0].events.length >= 3, 'event history must be preserved');
}

{
  const api = new FakeOkx();
  const p = basePlan({ entries: [{ ...basePlan().entries[0], amount: Number.NaN }] });
  const state = { plan: p, history: { purchases: [] }, operations: { operations: [] } };
  await assert.rejects(() => runState(state, api), /strictement positif/);
  assert.equal(api.priceCalls + api.balanceCalls + api.posts, 0, 'strict schema validation must stop before fake API calls');
}

console.log('orchestration fake API tests OK');
