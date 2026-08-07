/**
 * Client REST OKX v5 signé — zéro dépendance (Node >= 18).
 * Partagé par buy-now.mjs et run-due.mjs.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const PLAN_FILE = path.join(DATA_DIR, 'plan.json');
export const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

const API_KEY = process.env.OKX_API_KEY;
const SECRET_KEY = process.env.OKX_SECRET_KEY || process.env.OKX_API_SECRET;
const PASSPHRASE = process.env.OKX_PASSPHRASE;

/** Régions OKX : le domaine dépend de l'entité qui détient le compte. */
export const SITES = {
  eea: { label: 'Europe (EEA)', baseUrl: 'https://my.okx.com' },
  global: { label: 'International', baseUrl: 'https://www.okx.com' },
  us: { label: 'États-Unis', baseUrl: 'https://us.okx.com' },
  tr: { label: 'Turquie', baseUrl: 'https://tr.okx.com' },
};

// État courant, fixé par configure(). Valeurs de repli les plus prudentes :
// compte démo, Europe, et surtout aucune transmission d'ordre.
let demo = true;
let baseUrl = SITES.eea.baseUrl;
let dryRun = true;

const envSet = (name) => process.env[name] !== undefined && process.env[name] !== '';

/**
 * Détermine le mode d'exécution. Pour chacun des trois réglages, la variable
 * d'environnement l'emporte si elle est fournie ; sinon c'est le planning qui
 * décide ; sinon on retombe sur la valeur la plus prudente.
 *
 * À appeler une fois au démarrage, avant tout appel réseau.
 */
export function configure(plan) {
  demo = envSet('OKX_DEMO') ? process.env.OKX_DEMO !== '0' : plan?.demo !== false;

  baseUrl = envSet('OKX_BASE_URL')
    ? process.env.OKX_BASE_URL
    : plan?.baseUrl || SITES[plan?.site]?.baseUrl || SITES.eea.baseUrl;

  dryRun = envSet('DRY_RUN') ? process.env.DRY_RUN !== '0' : plan?.live !== true;

  return { demo, baseUrl, dryRun };
}

export const isDemo = () => demo;
export const isDryRun = () => dryRun;
export const currentBaseUrl = () => baseUrl;

/** Résumé lisible du mode courant, à afficher en tête de chaque exécution. */
export const modeLabel = () =>
  `compte ${demo ? 'DÉMO (argent fictif)' : 'RÉEL (argent réel)'} · ` +
  `${dryRun ? 'SIMULATION, aucun ordre transmis' : 'ACHATS RÉELS, les ordres partent'} · ` +
  baseUrl.replace('https://', '');

export function requireCredentials() {
  const missing = [];
  if (!process.env.OKX_API_KEY) missing.push('OKX_API_KEY');
  if (!process.env.OKX_SECRET_KEY && !process.env.OKX_API_SECRET) missing.push('OKX_SECRET_KEY ou OKX_API_SECRET');
  if (!process.env.OKX_PASSPHRASE) missing.push('OKX_PASSPHRASE');
  if (missing.length) {
    throw new Error(
      `Identifiants manquants : ${missing.join(', ')}.\n` +
        'En local : copiez .env.example vers .env et remplissez-le.\n' +
        'Sur GitHub : Settings > Secrets and variables > Actions.'
    );
  }
}

/** Signature OKX : base64(HMAC-SHA256(timestamp + method + path + body)). */
function signature(timestamp, method, requestPath, body) {
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(timestamp + method + requestPath + body)
    .digest('base64');
}

export async function okx(method, requestPath, payload) {
  const body = payload ? JSON.stringify(payload) : '';
  const timestamp = new Date().toISOString().slice(0, -5) + 'Z';

  const headers = {
    'OK-ACCESS-KEY': API_KEY,
    'OK-ACCESS-SIGN': signature(timestamp, method, requestPath, body),
    'OK-ACCESS-TIMESTAMP': timestamp,
    'OK-ACCESS-PASSPHRASE': PASSPHRASE,
    'Content-Type': 'application/json',
  };
  // Cet en-tête est la seule différence entre le compte démo et le compte réel.
  if (demo) headers['x-simulated-trading'] = '1';

  const timeoutMs = Number(process.env.OKX_HTTP_TIMEOUT_MS || 15_000);
  const res = await fetch(baseUrl + requestPath, {
    method,
    headers,
    body: body || undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json();

  if (json.code !== '0') {
    const detail = json.data?.[0]?.sMsg || json.msg || json.error_message || JSON.stringify(json);
    const error = new Error(`OKX ${method} ${requestPath} — code ${json.code} : ${detail}`);
    error.okxCode = json.code;
    error.okxData = json.data;
    throw error;
  }
  return json.data;
}

const q = (value) => encodeURIComponent(value);

/** Prix spot courant d'une paire. */
export async function lastPrice(instId) {
  const [ticker] = await okx('GET', `/api/v5/market/ticker?instId=${instId}`);
  return Number(ticker.last);
}

/** Solde disponible d'une devise. */
export async function availableBalance(ccy) {
  const [account] = await okx('GET', `/api/v5/account/balance?ccy=${ccy}`);
  const detail = account?.details?.find((d) => d.ccy === ccy);
  return Number(detail?.availBal || detail?.cashBal || 0);
}

/**
 * Achat au marché d'un montant exprimé dans la devise de cotation.
 * tgtCcy=quote_ccy => sz est en EUR/USDC, pas en BTC.
 */
export async function marketBuy(instId, amount, clOrdId) {
  const order = {
    instId,
    tdMode: 'cash',
    side: 'buy',
    ordType: 'market',
    sz: String(amount),
    tgtCcy: 'quote_ccy',
    clOrdId,
  };
  if (dryRun) return { dryRun: true, order, clOrdId };

  const [result] = await okx('POST', '/api/v5/trade/order', order);
  return { dryRun: false, order, ordId: result.ordId, clOrdId: result.clOrdId || clOrdId };
}

export async function getOrder(instId, { ordId, clOrdId }) {
  const query = ordId ? `ordId=${q(ordId)}` : `clOrdId=${q(clOrdId)}`;
  const [order] = await okx('GET', `/api/v5/trade/order?instId=${q(instId)}&${query}`);
  return order || null;
}

const ORDER_NOT_FOUND_CODES = new Set(['51603', '51604', '51617']);

/** Retourne null si OKX ne connaît pas encore / plus ce clOrdId. */
export async function findOrderByClOrdId(instId, clOrdId) {
  try {
    return await getOrder(instId, { clOrdId });
  } catch (err) {
    const msg = String(err.message || '').toLowerCase();
    if (ORDER_NOT_FOUND_CODES.has(String(err.okxCode))) return null;
    if (msg.includes('order does not exist') || msg.includes("doesn't exist") || msg.includes('order not exist')) return null;
    throw err;
  }
}

export function normalizeOrderFill(order) {
  return {
    ordId: order.ordId,
    clOrdId: order.clOrdId,
    filledQty: Number(order.accFillSz || 0),
    avgPx: Number(order.avgPx || 0),
    fee: Number(order.fee || 0),
    feeCcy: order.feeCcy || '',
    state: order.state,
  };
}

/** Détail d'exécution d'un ordre : quantité réelle et prix moyen. */
export async function orderFill(instId, ordId) {
  return normalizeOrderFill(await getOrder(instId, { ordId }));
}

export async function waitForOrderFill(instId, { ordId, clOrdId }, attempts = 10, delayMs = 1500) {
  let latest = null;
  for (let i = 0; i < attempts; i++) {
    latest = normalizeOrderFill(await getOrder(instId, ordId ? { ordId } : { clOrdId }));
    if (latest.state === 'filled' && latest.filledQty > 0) return latest;
    if (['canceled', 'cancelled', 'rejected'].includes(latest.state)) {
      if (latest.filledQty > 0) {
        latest.partialTerminal = true;
        return latest;
      }
      throw new Error(`ordre ${latest.state} sur OKX sans remplissage (ordId ${latest.ordId || ordId || clOrdId})`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  if (latest?.state === 'partially_filled' && latest.filledQty > 0) {
    const error = new Error(`ordre encore partiellement rempli après ${attempts} vérifications (ordId ${latest.ordId || ordId || clOrdId})`);
    error.partialFill = latest;
    throw error;
  }
  throw new Error(`ordre non rempli après ${attempts} vérifications (dernier état : ${latest?.state || 'inconnu'})`);
}

/** La devise de cotation est le second membre de l'instId (SOL-EUR -> EUR). */
export const quoteCurrency = (instId) => instId.split('-')[1];
/** L'actif acheté est le premier membre de l'instId (SOL-EUR -> SOL). */
export const baseCurrency = (instId) => instId.split('-')[0];

/** Vérifie qu'une paire existe bien au comptant sur OKX. */
export async function assertSpotInstrument(instId) {
  const data = await okx('GET', `/api/v5/public/instruments?instType=SPOT&instId=${instId}`);
  if (!data.length) throw new Error(`La paire ${instId} n'existe pas au comptant sur OKX.`);
  return data[0];
}

export const readJson = (file, fallback) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

/** clOrdId OKX : alphanumérique, 32 caractères maximum. */
export const makeClOrdId = (prefix = 'dca') => (prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 32);

export const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);
