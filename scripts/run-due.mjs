/**
 * Exécute les achats du planning dont l'échéance est atteinte, puis met à jour
 * data/plan.json et data/history.json.
 *
 * Idempotence forte : chaque échéance utilise un clOrdId déterministe. Si un
 * run s'interrompt après l'envoi à OKX mais avant le commit GitHub, le run
 * suivant recherche d'abord cet ordre chez OKX et le réconcilie au lieu d'en
 * envoyer un second.
 *
 *   node scripts/run-due.mjs            # simulation (DRY_RUN=1 par défaut)
 *   DRY_RUN=0 node scripts/run-due.mjs  # exécution réelle/démo armée
 */

import {
  PLAN_FILE, HISTORY_FILE, readJson, writeJson,
  requireCredentials, availableBalance, lastPrice, marketBuy,
  quoteCurrency, baseCurrency, log, configure, isDemo, isDryRun, modeLabel,
  findOrderByClOrdId, waitForOrderFill, normalizeOrderFill,
} from './okx.mjs';
import {
  deterministicClOrdId, normalizeRisk, isDue, validateEntrySafety,
  markFailure, addPurchaseIfMissing,
} from './safety.mjs';

requireCredentials();

const plan = readJson(PLAN_FILE, null);
if (!plan) {
  console.error(`Aucun planning trouvé. Lancez d'abord : node scripts/plan.mjs`);
  process.exit(1);
}

configure(plan);
const DRY_RUN = isDryRun();
const DEMO = isDemo();
const risk = normalizeRisk(plan);
const history = readJson(HISTORY_FILE, { purchases: [] });
const now = Date.now();
const due = plan.entries.filter((e) => isDue(e, now, risk));

log(`Mode : ${modeLabel()}`);
if (!DEMO && !DRY_RUN && process.env.ALLOW_REAL_TRADING !== 'I_CONFIRM_REAL_SPOT_BUYS') {
  console.error('ARGENT RÉEL BLOQUÉ : définissez ALLOW_REAL_TRADING=I_CONFIRM_REAL_SPOT_BUYS dans un environnement GitHub protégé après confirmation humaine.');
  process.exit(2);
}
log(`${due.length} achat(s) dû(s) sur ${plan.entries.filter((e) => e.status === 'pending' || (e.status === 'failed' && e.retryable !== false)).length} en attente/réessayables.`);
log(`Sécurité : max ${risk.maxAttempts} tentative(s), whitelist ${risk.allowedInstIds.join(', ') || 'vide'}, max ordre ${risk.maxOrderAmount ?? 'non défini'}, max jour ${risk.maxDailyQuoteAmount ?? 'non défini'}.`);

if (due.length === 0) {
  log('Rien à faire aujourd\'hui.');
  process.exit(0);
}

let failures = 0;

function recordSuccess(entry, fill, quote, source) {
  const executedAt = new Date().toISOString();
  entry.status = 'done';
  entry.executedAt = entry.executedAt || executedAt;
  entry.ordId = fill.ordId;
  entry.clOrdId = fill.clOrdId || entry.clOrdId;
  entry.filledQty = fill.filledQty;
  entry.avgPrice = fill.avgPx;
  delete entry.error;
  delete entry.errorClass;
  delete entry.retryAfter;
  entry.retryable = false;

  addPurchaseIfMissing(history, {
    id: entry.id,
    executedAt: entry.executedAt,
    instId: entry.instId,
    baseCcy: baseCurrency(entry.instId),
    quoteCcy: quote,
    amount: entry.amount,
    filledQty: fill.filledQty,
    avgPrice: fill.avgPx,
    fee: fill.fee,
    feeCcy: fill.feeCcy,
    ordId: fill.ordId,
    clOrdId: entry.clOrdId,
    demo: DEMO,
    source,
  });
}

for (const entry of due) {
  const quote = quoteCurrency(entry.instId);
  entry.clOrdId = entry.clOrdId || deterministicClOrdId(entry);
  log(`--- ${entry.id} : ${entry.amount} ${quote} sur ${entry.instId} (échéance ${entry.dueAt.slice(0, 10)}, clOrdId ${entry.clOrdId})`);

  try {
    validateEntrySafety(entry, plan, history, risk);

    const price = await lastPrice(entry.instId);
    const balance = await availableBalance(quote);
    log(`Prix ${entry.instId} : ${price} — solde ${quote} : ${balance}`);
    if (balance < entry.amount) {
      throw new Error(`solde insuffisant : ${balance} ${quote} disponible, ${entry.amount} requis`);
    }

    if (!DRY_RUN) {
      const existing = await findOrderByClOrdId(entry.instId, entry.clOrdId);
      if (existing) {
        const fill = normalizeOrderFill(existing);
        if (['filled', 'partially_filled'].includes(fill.state) && fill.filledQty > 0) {
          recordSuccess(entry, fill, quote, 'schedule-reconciled');
          log(`✓ Réconcilié — ordre OKX déjà existant ${fill.ordId}, ${fill.filledQty} ${baseCurrency(entry.instId)} à ${fill.avgPx || price} ${quote}`);
          continue;
        }
        log(`Ordre existant trouvé mais pas encore rempli (${fill.state}), attente...`);
        const waited = await waitForOrderFill(entry.instId, { clOrdId: entry.clOrdId }, risk.orderPollAttempts, risk.orderPollDelayMs);
        recordSuccess(entry, waited, quote, 'schedule-reconciled');
        log(`✓ Réconcilié après attente — ${waited.filledQty} ${baseCurrency(entry.instId)} à ${waited.avgPx || price} ${quote}`);
        continue;
      }
    }

    entry.attempts = (entry.attempts || 0) + 1;
    const result = await marketBuy(entry.instId, entry.amount, entry.clOrdId);

    if (result.dryRun) {
      log('DRY RUN — ordre non transmis :', JSON.stringify(result.order));
      entry.lastDryRunAt = new Date().toISOString();
      continue; // le planning reste pending
    }

    const fill = await waitForOrderFill(entry.instId, { ordId: result.ordId }, risk.orderPollAttempts, risk.orderPollDelayMs);
    recordSuccess(entry, fill, quote, 'schedule');
    log(`✓ Exécuté — ${fill.filledQty} ${baseCurrency(entry.instId)} à ${fill.avgPx || price} ${quote} (ordId ${fill.ordId})`);
  } catch (err) {
    failures++;
    markFailure(entry, err, risk);
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
