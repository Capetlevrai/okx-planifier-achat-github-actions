import { HISTORY_FILE, OPERATIONS_FILE, PLAN_FILE, SITES, readJson } from './okx.mjs';
import { atomicWriteJson } from './engine.mjs';

const TEST_TAG = 'sol-real-2min-test';
// Live SOL test plan is built only inside the Actions runner (never committed with real fills).
const now = new Date();
const second = new Date(now.getTime() + 120_000);

const history = readJson(HISTORY_FILE, { purchases: [] });
const operations = readJson(OPERATIONS_FILE, { schemaVersion: 1, operations: [] });

const currentPlan = readJson(PLAN_FILE, null);
const currentPlanIsThisTest = currentPlan?.strategy?.testTag === TEST_TAG ||
  (currentPlan?.entries || []).some((entry) => String(entry.id || '').startsWith(TEST_TAG));
const priorRealPurchase = (history.purchases || []).find((purchase) => purchase.demo === false);
const priorRealSubmitted = (operations.operations || []).find((operation) =>
  operation.demo === false && ['submitting', 'reconcile_pending', 'terminal'].includes(operation.state)
);
const priorThisTestOperation = (operations.operations || []).find((operation) =>
  String(operation.entryId || '').startsWith(TEST_TAG)
);

if (currentPlanIsThisTest || priorRealPurchase || priorRealSubmitted || priorThisTestOperation) {
  console.error('Test réel SOL refusé : le plan test existe déjà ou une activité réelle est présente.');
  console.error('Ce garde-fou évite qu’un rerun GitHub Actions rachète encore 1+1 USDC par accident.');
  process.exit(1);
}

const plan = {
  createdAt: now.toISOString(),
  live: true,
  demo: false,
  site: 'eea',
  baseUrl: SITES.eea.baseUrl,
  strategy: {
    label: 'Test réel SOL 1 USDC maintenant puis 1 USDC deux minutes après',
    instIds: ['SOL-USDC'],
    quoteCcy: 'USDC',
    amountPerAsset: 1,
    everyDays: 0,
    cycles: 2,
    hourUtc: now.getUTCHours(),
    testTag: TEST_TAG,
  },
  risk: {
    allowedInstIds: ['SOL-USDC'],
    maxOrderAmount: 1,
    maxDailyQuoteAmount: 2,
    maxPlanQuoteAmount: 2,
    maxLifetimeQuoteAmount: 2,
    maxAttempts: 1,
    retryDelayMinutes: 60,
    orderPollAttempts: 10,
    orderPollDelayMs: 1500,
  },
  entries: [
    {
      id: `${TEST_TAG}-1-SOL-USDC`,
      dueAt: now.toISOString(),
      instId: 'SOL-USDC',
      amount: 1,
      status: 'pending',
      attempts: 0,
    },
    {
      id: `${TEST_TAG}-2-SOL-USDC`,
      dueAt: second.toISOString(),
      instId: 'SOL-USDC',
      amount: 1,
      status: 'pending',
      attempts: 0,
    },
  ],
};

atomicWriteJson(PLAN_FILE, plan);
console.log(`Plan ${TEST_TAG} créé : 1 USDC SOL maintenant (${plan.entries[0].dueAt}) puis 1 USDC SOL à ${plan.entries[1].dueAt}. Total plafonné : 2 USDC.`);
