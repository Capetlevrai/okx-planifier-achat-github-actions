/**
 * Achat immédiat et ponctuel, hors planning. Le résultat est ajouté à
 * data/history.json et apparaît donc dans l'interface.
 *
 *   node scripts/buy-now.mjs --amount 50 --instId BTC-EUR            # simulation
 *   DRY_RUN=0 node scripts/buy-now.mjs --amount 50 --instId BTC-EUR  # réel
 */

import {
  HISTORY_FILE, readJson, writeJson,
  requireCredentials, availableBalance, lastPrice, marketBuy, orderFill,
  quoteCurrency, baseCurrency, makeClOrdId, log, resolveDryRun, DEMO,
} from './okx.mjs';

// Achat hors planning : seule la variable d'environnement fait foi.
const DRY_RUN = resolveDryRun(null);

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const instId = String(arg('instId', process.env.DCA_INST_ID ?? 'BTC-USDC')).toUpperCase();
const amount = Number(arg('amount', process.env.DCA_AMOUNT ?? '50'));
const quote = quoteCurrency(instId);
const base = baseCurrency(instId);

if (!Number.isFinite(amount) || amount <= 0) throw new Error('--amount doit être un nombre positif.');

requireCredentials();

log(`Achat ponctuel : ${amount} ${quote} sur ${instId} — mode ${DEMO ? 'DÉMO' : 'RÉEL'}${DRY_RUN ? ' — DRY RUN' : ''}`);

const balance = await availableBalance(quote);
const price = await lastPrice(instId);
log(`Prix ${instId} : ${price} — solde ${quote} : ${balance}`);

if (balance < amount) {
  console.error(`Solde insuffisant : ${balance} ${quote} disponible, ${amount} requis. Aucun ordre envoyé.`);
  process.exit(2);
}

log(`Estimation : ~${(amount / price).toFixed(8)} ${base} pour ${amount} ${quote}`);

const result = await marketBuy(instId, amount, makeClOrdId('now'), DRY_RUN);

if (result.dryRun) {
  log('DRY RUN — ordre qui serait transmis :');
  console.log(JSON.stringify(result.order, null, 2));
  log('Relancez avec DRY_RUN=0 pour exécuter réellement.');
  process.exit(0);
}

await new Promise((r) => setTimeout(r, 1500));
const fill = await orderFill(instId, result.ordId);

const history = readJson(HISTORY_FILE, { purchases: [] });
history.purchases.push({
  id: `now-${Date.now().toString(36)}`,
  executedAt: new Date().toISOString(),
  instId,
  baseCcy: base,
  quoteCcy: quote,
  amount,
  filledQty: fill.filledQty,
  avgPrice: fill.avgPx || price,
  fee: fill.fee,
  feeCcy: fill.feeCcy,
  ordId: result.ordId,
  demo: DEMO,
  source: 'manual',
});
history.updatedAt = new Date().toISOString();
writeJson(HISTORY_FILE, history);

log(`✓ Exécuté — ${fill.filledQty} ${base} à ${fill.avgPx || price} ${quote} (ordId ${result.ordId})`);
