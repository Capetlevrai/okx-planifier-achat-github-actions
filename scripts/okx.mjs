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
const SECRET_KEY = process.env.OKX_SECRET_KEY;
const PASSPHRASE = process.env.OKX_PASSPHRASE;

/** Compte démo (simulated trading) sauf si OKX_DEMO=0. */
export const DEMO = (process.env.OKX_DEMO ?? '1') !== '0';
/** my.okx.com = entité EEA. www.okx.com = global. */
export const BASE_URL = process.env.OKX_BASE_URL ?? 'https://my.okx.com';
/** Garde-fou : aucun ordre n'est transmis tant que DRY_RUN n'est pas mis à 0. */
export const DRY_RUN = (process.env.DRY_RUN ?? '1') !== '0';

export function requireCredentials() {
  const missing = ['OKX_API_KEY', 'OKX_SECRET_KEY', 'OKX_PASSPHRASE'].filter((k) => !process.env[k]);
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
  if (DEMO) headers['x-simulated-trading'] = '1';

  const res = await fetch(BASE_URL + requestPath, { method, headers, body: body || undefined });
  const json = await res.json();

  if (json.code !== '0') {
    const detail = json.data?.[0]?.sMsg || json.msg || json.error_message || JSON.stringify(json);
    throw new Error(`OKX ${method} ${requestPath} — code ${json.code} : ${detail}`);
  }
  return json.data;
}

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
  if (DRY_RUN) return { dryRun: true, order };

  const [result] = await okx('POST', '/api/v5/trade/order', order);
  return { dryRun: false, order, ordId: result.ordId, clOrdId: result.clOrdId };
}

/** Détail d'exécution d'un ordre : quantité réelle et prix moyen. */
export async function orderFill(instId, ordId) {
  const [order] = await okx('GET', `/api/v5/trade/order?instId=${instId}&ordId=${ordId}`);
  return {
    filledQty: Number(order.accFillSz || 0),
    avgPx: Number(order.avgPx || 0),
    fee: Number(order.fee || 0),
    feeCcy: order.feeCcy || '',
    state: order.state,
  };
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
