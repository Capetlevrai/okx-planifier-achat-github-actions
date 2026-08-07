/**
 * Génère le planning d'achats (data/plan.json).
 *
 * Fonctionne avec n'importe quelle paire au comptant d'OKX, et avec plusieurs
 * actifs à la fois.
 *
 *   # 50 USDC de BTC tous les 15 jours pendant 3 mois
 *   node scripts/plan.mjs --amount 50 --every 15 --months 3 --instId BTC-USDC
 *
 *   # 30 € de BTC + 30 € d'ETH + 30 € de SOL, chaque semaine
 *   node scripts/plan.mjs --amount 30 --every 7 --instId BTC-EUR,ETH-EUR,SOL-EUR
 *
 *   # 90 € répartis à parts égales entre 3 actifs (30 € chacun)
 *   node scripts/plan.mjs --amount 90 --split --instId BTC-EUR,ETH-EUR,SOL-EUR
 *
 * Options :
 *   --amount <n>    montant par actif et par échéance                (défaut 50)
 *   --split         répartit --amount entre les actifs au lieu de le
 *                   dupliquer sur chacun
 *   --instId <ids>  paire(s), séparées par des virgules              (défaut BTC-USDC)
 *   --every <n>     intervalle en jours                              (défaut 15)
 *   --months <n>    durée totale en mois                             (défaut 3)
 *   --count <n>     nombre d'échéances (prioritaire sur --months)
 *   --start <date>  première échéance, AAAA-MM-JJ                    (défaut aujourd'hui)
 *   --hour <n>      heure d'exécution UTC, 0-23                      (défaut 9)
 *   --check         vérifie auprès d'OKX que chaque paire existe
 *   --live          arme le plan : les ordres partiront réellement
 *                   (sans ce drapeau, tout est simulé)
 *   --force         écrase un planning existant
 */

import { PLAN_FILE, readJson, writeJson, log, quoteCurrency, assertSpotInstrument, requireCredentials } from './okx.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else out[key] = next, i++;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const instIds = String(args.instId ?? 'BTC-USDC')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const totalAmount = Number(args.amount ?? 50);
const split = Boolean(args.split);
const every = Number(args.every ?? 15);
const months = Number(args.months ?? 3);
const hour = Number(args.hour ?? 9);
const startDate = args.start ? new Date(`${args.start}T00:00:00Z`) : new Date();

if (!instIds.length) throw new Error('--instId ne peut pas être vide.');
if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new Error('--amount doit être un nombre positif.');
if (!Number.isFinite(every) || every < 1) throw new Error('--every doit valoir au moins 1 jour.');
if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('--hour doit être entre 0 et 23.');
if (Number.isNaN(startDate.getTime())) throw new Error('--start doit être au format AAAA-MM-JJ.');

for (const id of instIds) {
  if (!/^[A-Z0-9]+-[A-Z0-9]+$/.test(id)) throw new Error(`Paire invalide : "${id}". Format attendu : ACTIF-DEVISE (ex. SOL-EUR).`);
}

// Toutes les paires doivent partager la même devise de cotation : le solde à
// vérifier et les totaux affichés n'auraient sinon aucun sens.
const quotes = [...new Set(instIds.map(quoteCurrency))];
if (quotes.length > 1) {
  throw new Error(`Toutes les paires doivent utiliser la même devise de cotation. Trouvé : ${quotes.join(', ')}.`);
}

const perAsset = split ? totalAmount / instIds.length : totalAmount;
if (perAsset <= 0) throw new Error('Le montant par actif est nul — vérifiez --amount et --split.');

const count = args.count ? Number(args.count) : Math.floor((months * 30) / every);
if (!Number.isFinite(count) || count < 1) throw new Error('Le planning calculé est vide — vérifiez --every / --months.');

if (args.check) {
  requireCredentials();
  for (const id of instIds) {
    const inst = await assertSpotInstrument(id);
    log(`✓ ${id} — lot minimum ${inst.minSz} ${inst.baseCcy}`);
  }
}

const existing = readJson(PLAN_FILE, null);
if (existing && !args.force) {
  console.error(`Un planning existe déjà (${existing.entries.length} entrées) dans ${PLAN_FILE}.`);
  console.error('Relancez avec --force pour le remplacer.');
  process.exit(1);
}

// Une entrée par échéance ET par actif.
const entries = [];
for (let i = 0; i < count; i++) {
  const date = new Date(startDate);
  date.setUTCDate(date.getUTCDate() + i * every);
  date.setUTCHours(hour, 0, 0, 0);
  for (const instId of instIds) {
    entries.push({
      id: `dca-${i + 1}-${instId}`,
      dueAt: date.toISOString(),
      instId,
      amount: Number(perAsset.toFixed(8)),
      status: 'pending', // pending | done | failed
    });
  }
}

const quote = quotes[0];
const perCycle = perAsset * instIds.length;

const plan = {
  createdAt: new Date().toISOString(),
  // false = simulation, aucun ordre transmis. C'est le défaut, volontairement.
  live: Boolean(args.live),
  strategy: {
    label: `${perAsset} ${quote} par actif tous les ${every} jours`,
    instIds,
    quoteCcy: quote,
    amountPerAsset: Number(perAsset.toFixed(8)),
    everyDays: every,
    cycles: count,
    hourUtc: hour,
  },
  entries,
};

writeJson(PLAN_FILE, plan);

log(`Planning créé : ${count} échéances × ${instIds.length} actif(s) = ${entries.length} achats`);
log(`Actifs : ${instIds.join(', ')}`);
log(`${perAsset} ${quote} par actif et par échéance, soit ${perCycle} ${quote} par cycle`);
log(`Du ${entries[0].dueAt.slice(0, 10)} au ${entries.at(-1).dueAt.slice(0, 10)} à ${hour}h UTC`);
log(`Total engagé : ${perCycle * count} ${quote}`);
log(plan.live
  ? '⚠️  Mode RÉEL : les ordres seront transmis à OKX aux échéances.'
  : 'Mode SIMULATION : aucun ordre ne sera transmis (relancez avec --live pour armer).');
log(`Fichier : ${PLAN_FILE}`);
