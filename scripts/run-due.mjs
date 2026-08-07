/**
 * Exécute les achats du planning dont l'échéance est atteinte, puis met à jour
 * data/plan.json et data/history.json.
 *
 * Appelé chaque jour par .github/workflows/dca.yml. Idempotent : une entrée déjà
 * marquée "done" n'est jamais rejouée, même si le workflow tourne plusieurs fois.
 *
 *   node scripts/run-due.mjs            # simulation (DRY_RUN=1 par défaut)
 *   DRY_RUN=0 node scripts/run-due.mjs  # exécution réelle
 */

import {
  PLAN_FILE, HISTORY_FILE, readJson, writeJson,
  requireCredentials, availableBalance, lastPrice, marketBuy, orderFill,
  quoteCurrency, baseCurrency, makeClOrdId, log, resolveDryRun, DEMO,
} from './okx.mjs';

requireCredentials();

const plan = readJson(PLAN_FILE, null);
if (!plan) {
  console.error(`Aucun planning trouvé. Lancez d'abord : node scripts/plan.mjs`);
  process.exit(1);
}

const DRY_RUN = resolveDryRun(plan);

const history = readJson(HISTORY_FILE, { purchases: [] });
const now = Date.now();
const due = plan.entries.filter((e) => e.status === 'pending' && new Date(e.dueAt).getTime() <= now);

log(`Mode ${DEMO ? 'DÉMO' : 'RÉEL'}${DRY_RUN ? ' — DRY RUN' : ''}`);
log(`${due.length} achat(s) dû(s) sur ${plan.entries.filter((e) => e.status === 'pending').length} en attente.`);

if (due.length === 0) {
  log('Rien à faire aujourd\'hui.');
  process.exit(0);
}

let failures = 0;

for (const entry of due) {
  const quote = quoteCurrency(entry.instId);
  log(`--- ${entry.id} : ${entry.amount} ${quote} sur ${entry.instId} (échéance ${entry.dueAt.slice(0, 10)})`);

  try {
    const balance = await availableBalance(quote);
    if (balance < entry.amount) {
      throw new Error(`solde insuffisant : ${balance} ${quote} disponible, ${entry.amount} requis`);
    }

    const price = await lastPrice(entry.instId);
    log(`Prix ${entry.instId} : ${price} — solde ${quote} : ${balance}`);

    const result = await marketBuy(entry.instId, entry.amount, makeClOrdId(), DRY_RUN);

    if (result.dryRun) {
      log('DRY RUN — ordre non transmis :', JSON.stringify(result.order));
      continue; // le planning reste "pending"
    }

    // L'ordre marché se remplit quasi instantanément ; on relit le détail pour
    // enregistrer la quantité et le prix moyen réellement obtenus.
    await new Promise((r) => setTimeout(r, 1500));
    const fill = await orderFill(entry.instId, result.ordId);

    entry.status = 'done';
    entry.executedAt = new Date().toISOString();
    entry.ordId = result.ordId;

    history.purchases.push({
      id: entry.id,
      executedAt: entry.executedAt,
      instId: entry.instId,
      baseCcy: baseCurrency(entry.instId),
      quoteCcy: quote,
      amount: entry.amount,
      filledQty: fill.filledQty,
      avgPrice: fill.avgPx || price,
      fee: fill.fee,
      feeCcy: fill.feeCcy,
      ordId: result.ordId,
      demo: DEMO,
      source: 'schedule',
    });

    log(`✓ Exécuté — ${fill.filledQty} ${baseCurrency(entry.instId)} à ${fill.avgPx || price} ${quote} (ordId ${result.ordId})`);
  } catch (err) {
    failures++;
    entry.status = 'failed';
    entry.error = err.message;
    entry.failedAt = new Date().toISOString();
    console.error(`✗ ${entry.id} — ${err.message}`);
  }
}

if (!DRY_RUN) {
  plan.updatedAt = new Date().toISOString();
  writeJson(PLAN_FILE, plan);
  history.updatedAt = new Date().toISOString();
  writeJson(HISTORY_FILE, history);
  log(`Fichiers mis à jour — ${history.purchases.length} achat(s) au total.`);
}

// Sortie non nulle si au moins un achat a échoué : le run GitHub apparaît en rouge.
process.exit(failures > 0 ? 1 : 0);
