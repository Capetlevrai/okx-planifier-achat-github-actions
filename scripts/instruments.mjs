/**
 * Télécharge la liste des paires spot OKX et écrit data/instruments.json.
 * Aucune clé API nécessaire. Utile pour l'interface et pour aider l'utilisateur
 * à choisir une paire disponible en démo ou en réel.
 */
import { DATA_DIR, writeJson, SITES } from './okx.mjs';
import path from 'node:path';

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
const site = String(args.site ?? 'eea').toLowerCase();
if (!SITES[site]) throw new Error(`--site inconnu : ${site}. Valeurs : ${Object.keys(SITES).join(', ')}`);
const quote = args.quote ? String(args.quote).toUpperCase() : null;
const baseUrl = args.baseUrl || SITES[site].baseUrl;

const res = await fetch(`${baseUrl}/api/v5/public/instruments?instType=SPOT`, {
  headers: { 'x-simulated-trading': '1' },
});
const json = await res.json();
if (json.code !== '0') throw new Error(`OKX instruments — code ${json.code}: ${json.msg || JSON.stringify(json)}`);

const instruments = json.data
  .filter((x) => x.state === 'live')
  .map((x) => ({
    instId: x.instId,
    baseCcy: x.baseCcy,
    quoteCcy: x.quoteCcy,
    minSz: x.minSz,
    tickSz: x.tickSz,
    lotSz: x.lotSz,
  }))
  .filter((x) => !quote || x.quoteCcy === quote)
  .sort((a, b) => a.instId.localeCompare(b.instId));

const byQuote = instruments.reduce((acc, x) => {
  acc[x.quoteCcy] = (acc[x.quoteCcy] || 0) + 1;
  return acc;
}, {});

const payload = {
  generatedAt: new Date().toISOString(),
  site,
  baseUrl,
  count: instruments.length,
  byQuote,
  instruments,
};
writeJson(path.join(DATA_DIR, 'instruments.json'), payload);
console.log(`data/instruments.json écrit : ${instruments.length} paires spot live (${Object.keys(byQuote).length} devises de cotation).`);
if (quote) console.log(`Filtre quote=${quote}`);
