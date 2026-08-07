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
 *   --account <x>   "demo" (défaut, argent fictif) ou "reel" (argent réel)
 *   --site <x>      eea (défaut, Europe) | global | us | tr
 *   --live          arme le plan : les ordres partiront réellement
 *                   (sans ce drapeau, tout est simulé)
 *   --max-order <n> limite maximale par ordre                 (défaut --amount)
 *   --max-day <n>   limite maximale par jour et devise         (défaut cycle)
 *   --attempts <n>  nombre maximum de tentatives par échéance  (défaut 3)
 *   --force         écrase un planning existant
 */

import { PLAN_FILE, HISTORY_FILE, OPERATIONS_FILE, readJson, log, quoteCurrency, assertSpotInstrument, assertSpotMarketReady, configure, SITES, modeLabel } from './okx.mjs';
import { atomicWriteJson, hasNonTerminalOperations } from './engine.mjs';
import { cumulativeLifetimeCap } from './safety.mjs';

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
if (args.start && !/^\d{4}-\d{2}-\d{2}$/.test(String(args.start))) throw new Error('--start doit être au format AAAA-MM-JJ.');
const startDate = args.start ? new Date(`${args.start}T00:00:00Z`) : new Date();

if (!instIds.length) throw new Error('--instId ne peut pas être vide.');
if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new Error('--amount doit être un nombre positif.');
if (!Number.isInteger(every) || every < 1) throw new Error('--every doit être un nombre entier de jours >= 1.');
if (!args.count && (!Number.isFinite(months) || months <= 0)) throw new Error('--months doit être un nombre positif.');
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
if (!Number.isInteger(count) || count < 1) throw new Error('Le nombre d’échéances doit être un entier >= 1 — vérifiez --count / --every / --months.');

const site = String(args.site ?? 'eea').toLowerCase();
if (!SITES[site]) throw new Error(`--site inconnu : "${site}". Valeurs : ${Object.keys(SITES).join(', ')}.`);

const account = String(args.account ?? 'demo').toLowerCase();
if (!['demo', 'reel', 'real'].includes(account)) throw new Error('--account doit valoir "demo" ou "reel".');
const isDemoAccount = account === 'demo';

if (args.check) {
  try {
    configure({ demo: isDemoAccount, site, live: false });
    for (const id of instIds) {
      const inst = await assertSpotInstrument(id);
      await assertSpotMarketReady(id);
      log(`✓ ${id} — marché disponible, lot minimum ${inst.minSz} ${inst.baseCcy}`);
    }
  } catch (error) {
    console.error(`Vérification du marché impossible : ${error.message}`);
    process.exit(1);
  }
}

const existing = readJson(PLAN_FILE, null);
const existingOperations = readJson(OPERATIONS_FILE, { operations: [] });
const existingHistory = readJson(HISTORY_FILE, { purchases: [] });
if (existing && hasNonTerminalOperations(existingOperations)) {
  console.error('Reconfiguration refusée : le registre contient une soumission ambiguë à réconcilier.');
  console.error(`Conservez ${OPERATIONS_FILE} et laissez scripts/run-due.mjs terminer la réconciliation avant de remplacer le plan.`);
  process.exit(1);
}
if (existing && !args.force) {
  console.error(`Un planning existe déjà (${existing.entries.length} entrées) dans ${PLAN_FILE}.`);
  console.error('Relancez avec --force pour le remplacer uniquement après absence d’opération non terminale.');
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
// Le plafond de durée de vie est cumulatif entre les plans. Sans cette base,
// recréer un plan après un premier achat ferait compter l'ancien audit contre
// un plafond ne couvrant que le nouveau plan et bloquerait son premier ordre.
const maxLifetimeQuoteAmount = cumulativeLifetimeCap(
  existingHistory,
  existingOperations,
  quote,
  isDemoAccount,
  perCycle * count,
);
const maxOrderAmount = args['max-order'] ? Number(args['max-order']) : perAsset;
const maxDailyQuoteAmount = args['max-day'] ? Number(args['max-day']) : perCycle;
const maxAttempts = args.attempts ? Number(args.attempts) : 3;
if (!Number.isFinite(maxOrderAmount) || maxOrderAmount < perAsset) throw new Error('--max-order doit être supérieur ou égal au montant par actif.');
if (!Number.isFinite(maxDailyQuoteAmount) || maxDailyQuoteAmount < perCycle) throw new Error('--max-day doit couvrir au moins un cycle complet.');
if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) throw new Error('--attempts doit être un entier entre 1 et 20.');

const plan = {
  createdAt: new Date().toISOString(),
  // Les trois réglages qui pilotent l'exécution, tous à leur valeur prudente
  // par défaut. Ils sont relus par configure() dans scripts/okx.mjs.
  live: Boolean(args.live),   // false = simulation, aucun ordre transmis
  demo: isDemoAccount,        // true  = argent fictif
  site,                       // région du compte
  baseUrl: SITES[site].baseUrl,
  strategy: {
    label: `${perAsset} ${quote} par actif tous les ${every} jours`,
    instIds,
    quoteCcy: quote,
    amountPerAsset: Number(perAsset.toFixed(8)),
    everyDays: every,
    cycles: count,
    hourUtc: hour,
  },
  risk: {
    allowedInstIds: instIds,
    maxOrderAmount: Number(maxOrderAmount.toFixed(8)),
    maxDailyQuoteAmount: Number(maxDailyQuoteAmount.toFixed(8)),
    maxPlanQuoteAmount: Number((perCycle * count).toFixed(8)),
    maxLifetimeQuoteAmount: Number(maxLifetimeQuoteAmount.toFixed(8)),
    maxAttempts,
    retryDelayMinutes: 60,
    orderPollAttempts: 10,
    orderPollDelayMs: 1500,
  },
  entries,
};

atomicWriteJson(PLAN_FILE, plan);

log(`Planning créé : ${count} échéances × ${instIds.length} actif(s) = ${entries.length} achats`);
log(`Actifs : ${instIds.join(', ')}`);
log(`${perAsset} ${quote} par actif et par échéance, soit ${perCycle} ${quote} par cycle`);
log(`Du ${entries[0].dueAt.slice(0, 10)} au ${entries.at(-1).dueAt.slice(0, 10)} à ${hour}h UTC`);
log(`Total engagé : ${perCycle * count} ${quote}`);
configure(plan);
log(`Mode : ${modeLabel()}`);
if (!plan.live) log('Relancez avec --live pour armer les achats.');
else if (!plan.demo) log('⚠️  ARGENT RÉEL : les ordres partiront pour de vrai aux échéances.');
log(`Fichier : ${PLAN_FILE}`);
