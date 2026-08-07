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

try {
  configure(plan);
} catch (error) {
  console.error(`Échec de configuration sécurisée : ${error.message}`);
  process.exit(1);
}
const DRY_RUN = isDryRun();
const DEMO = isDemo();

// Même une simulation lit prix/solde et une réconciliation lit les ordres :
// ces appels privés exigent des identifiants, sans jamais les afficher.
requireCredentials();
log(`Mode : ${modeLabel()}`);
const REAL_TRADING_ARMED = process.env.ALLOW_REAL_TRADING === 'I_CONFIRM_REAL_SPOT_BUYS';
if (!DEMO && !REAL_TRADING_ARMED) {
  log('Compte réel désarmé : réconciliation en lecture seule autorisée, aucun nouveau POST possible.');
}

const history = readJson(HISTORY_FILE, { purchases: [] });
const operations = readJson(OPERATIONS_FILE, { schemaVersion: 1, operations: [] });

const client = { findOrderByClOrdId, lastPrice, availableBalance, marketBuy };
const persist = async ({ plan: nextPlan, history: nextHistory, operations: nextOperations }) => {
  nextPlan.updatedAt = new Date().toISOString();
  nextHistory.updatedAt = new Date().toISOString();
  nextOperations.updatedAt = new Date().toISOString();
  atomicWriteJson(OPERATIONS_FILE, nextOperations);
  atomicWriteJson(PLAN_FILE, nextPlan);
  atomicWriteJson(HISTORY_FILE, nextHistory);
};

try {
  const result = await runPlanner({
    plan,
    history,
    operations,
    client,
    dryRun: DRY_RUN,
    demo: DEMO,
    realTradingArmed: REAL_TRADING_ARMED,
    allowNewSubmissions: DEMO || REAL_TRADING_ARMED,
    persist,
    log,
  });
  const open = result.operations.operations.filter((op) => ['submitting', 'reconcile_pending'].includes(op.state)).length;
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
