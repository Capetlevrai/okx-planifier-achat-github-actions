import {
  PLAN_FILE,
  HISTORY_FILE,
  OPERATIONS_FILE,
  readJson,
  requireCredentials,
  availableBalance,
  lastPrice,
  marketBuy,
  log,
  configure,
  isDemo,
  isDryRun,
  modeLabel,
  findOrderByClOrdId,
} from './okx.mjs';
import { atomicWriteJson, runPlanner } from './engine.mjs';

const plan = readJson(PLAN_FILE, null);
if (!plan) {
  console.error(`Aucun planning trouvé. Lancez d'abord : node scripts/plan.mjs`);
  process.exit(1);
}

configure(plan);
const DRY_RUN = isDryRun();
const DEMO = isDemo();

if (!DRY_RUN) requireCredentials();
log(`Mode : ${modeLabel()}`);
if (!DEMO && !DRY_RUN && process.env.ALLOW_REAL_TRADING !== 'I_CONFIRM_REAL_SPOT_BUYS') {
  console.error('ARGENT RÉEL BLOQUÉ : secret ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS requis dans l’environnement GitHub protégé real-trading.');
  process.exit(2);
}

const history = readJson(HISTORY_FILE, { purchases: [] });
const operations = readJson(OPERATIONS_FILE, { schemaVersion: 1, operations: [] });

const client = { findOrderByClOrdId, lastPrice, availableBalance, marketBuy };
const persist = async ({ plan: nextPlan, history: nextHistory, operations: nextOperations }) => {
  if (DRY_RUN) return;
  nextPlan.updatedAt = new Date().toISOString();
  nextHistory.updatedAt = new Date().toISOString();
  nextOperations.updatedAt = new Date().toISOString();
  atomicWriteJson(OPERATIONS_FILE, nextOperations);
  atomicWriteJson(PLAN_FILE, nextPlan);
  atomicWriteJson(HISTORY_FILE, nextHistory);
};

try {
  const result = await runPlanner({ plan, history, operations, client, dryRun: DRY_RUN, demo: DEMO, persist, log });
  const open = result.operations.operations.filter((op) => op.state !== 'terminal').length;
  log(`Registre : ${result.operations.operations.length} opération(s), ${open} non terminale(s). Historique : ${result.history.purchases.length} ligne(s).`);
  if (result.failures.length) {
    for (const failure of result.failures) console.error(`✗ ${failure}`);
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(`Échec de sécurité : ${err.message}`);
  process.exit(1);
}
