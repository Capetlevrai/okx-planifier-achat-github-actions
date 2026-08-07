/**
 * Client REST OKX v5 signé — zéro dépendance (Node >= 20).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const PLAN_FILE = path.join(DATA_DIR, 'plan.json');
export const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
export const OPERATIONS_FILE = path.join(DATA_DIR, 'operations.json');

const API_KEY = process.env.OKX_API_KEY;
const SECRET_KEY = process.env.OKX_SECRET_KEY || process.env.OKX_API_SECRET;
const PASSPHRASE = process.env.OKX_PASSPHRASE;

export const SITES = {
  eea: { label: 'Europe (EEA)', baseUrl: 'https://my.okx.com' },
  global: { label: 'International', baseUrl: 'https://www.okx.com' },
  us: { label: 'États-Unis', baseUrl: 'https://us.okx.com' },
  tr: { label: 'Turquie', baseUrl: 'https://tr.okx.com' },
};

const ALLOWED_BASE_URLS = new Set(Object.values(SITES).map((site) => site.baseUrl));
let demo = true;
let baseUrl = SITES.eea.baseUrl;
let dryRun = true;
const envSet = (name) => process.env[name] !== undefined && process.env[name] !== '';

function validateAllowedBaseUrl(urlText, source) {
  const parsed = new URL(urlText);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${source} contient une URL OKX non autorisée.`);
  }
  const normalized = `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
  if (!ALLOWED_BASE_URLS.has(normalized)) throw new Error(`${source} cible un hôte non autorisé : ${parsed.hostname}.`);
  return normalized;
}

export function configure(plan) {
  demo = envSet('OKX_DEMO') ? process.env.OKX_DEMO !== '0' : plan?.demo !== false;
  dryRun = envSet('DRY_RUN') ? process.env.DRY_RUN !== '0' : plan?.live !== true;
  const siteUrl = SITES[plan?.site]?.baseUrl || SITES.eea.baseUrl;
  if (envSet('OKX_BASE_URL')) baseUrl = validateAllowedBaseUrl(process.env.OKX_BASE_URL, 'OKX_BASE_URL');
  else if (plan?.baseUrl) baseUrl = validateAllowedBaseUrl(plan.baseUrl, 'plan.baseUrl');
  else baseUrl = siteUrl;
  if (!ALLOWED_BASE_URLS.has(baseUrl)) throw new Error('Base URL OKX non autorisée.');
  return { demo, baseUrl, dryRun };
}

export const isDemo = () => demo;
export const isDryRun = () => dryRun;
export const currentBaseUrl = () => baseUrl;
export const modeLabel = () =>
  `compte ${demo ? 'DÉMO (argent fictif)' : 'RÉEL (argent réel)'} · ` +
  `${dryRun ? 'SIMULATION, aucun ordre transmis' : 'ACHATS ACTIVÉS, les ordres partent'} · ` +
  baseUrl.replace('https://', '');

export function requireCredentials() {
  const missing = [];
  if (!process.env.OKX_API_KEY) missing.push('OKX_API_KEY');
  if (!process.env.OKX_SECRET_KEY && !process.env.OKX_API_SECRET) missing.push('OKX_SECRET_KEY ou OKX_API_SECRET');
  if (!process.env.OKX_PASSPHRASE) missing.push('OKX_PASSPHRASE');
  if (missing.length) throw new Error(`Identifiants manquants : ${missing.join(', ')}.`);
}

function signature(timestamp, method, requestPath, body) {
  return crypto.createHmac('sha256', SECRET_KEY).update(timestamp + method + requestPath + body).digest('base64');
}

async function parseOkxJson(res, method, requestPath) {
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!text) {
    const err = new Error(`OKX ${method} ${requestPath} — réponse vide (${res.status})`);
    err.httpStatus = res.status;
    throw err;
  }
  if (!contentType.includes('application/json')) {
    const err = new Error(`OKX ${method} ${requestPath} — réponse non JSON (${res.status})`);
    err.httpStatus = res.status;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    const err = new Error(`OKX ${method} ${requestPath} — JSON invalide (${res.status})`);
    err.cause = cause;
    err.httpStatus = res.status;
    throw err;
  }
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
  if (demo) headers['x-simulated-trading'] = '1';
  const timeoutMs = Number(process.env.OKX_HTTP_TIMEOUT_MS || 15_000);
  const res = await fetch(baseUrl + requestPath, { method, headers, body: body || undefined, signal: AbortSignal.timeout(timeoutMs) });
  const json = await parseOkxJson(res, method, requestPath);
  if (!res.ok) {
    const err = new Error(`OKX ${method} ${requestPath} — HTTP ${res.status} : ${json.msg || json.error_message || 'erreur HTTP'}`);
    err.httpStatus = res.status;
    err.okxCode = json.code;
    err.okxData = json.data;
    throw err;
  }
  if (json.code !== '0') {
    const detail = json.data?.[0]?.sMsg || json.msg || json.error_message || JSON.stringify(json);
    const error = new Error(`OKX ${method} ${requestPath} — code ${json.code} : ${detail}`);
    error.okxCode = json.code;
    error.okxData = json.data;
    throw error;
  }
  const data = Array.isArray(json.data) ? json.data : [];
  for (const item of data) {
    if (item && item.sCode !== undefined && item.sCode !== '0') {
      const error = new Error(`OKX ${method} ${requestPath} — item ${item.sCode} : ${item.sMsg || 'rejet par élément'}`);
      error.okxCode = item.sCode;
      error.okxData = item;
      throw error;
    }
  }
  return data;
}

const q = (value) => encodeURIComponent(value);
export async function lastPrice(instId) {
  const [ticker] = await okx('GET', `/api/v5/market/ticker?instId=${q(instId)}`);
  const price = Number(ticker?.last);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`No market data available for ${instId}`);
  return price;
}
export async function availableBalance(ccy) {
  const [account] = await okx('GET', `/api/v5/account/balance?ccy=${q(ccy)}`);
  const detail = account?.details?.find((d) => d.ccy === ccy);
  const balance = Number(detail?.availBal || detail?.cashBal || 0);
  if (!Number.isFinite(balance) || balance < 0) throw new Error(`solde invalide pour ${ccy}`);
  return balance;
}
export async function marketBuy(instId, amount, clOrdId) {
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('montant achat invalide');
  const order = { instId, tdMode: 'cash', side: 'buy', ordType: 'market', sz: String(amount), tgtCcy: 'quote_ccy', clOrdId };
  if (dryRun) return { dryRun: true, order, clOrdId };
  const [result] = await okx('POST', '/api/v5/trade/order', order);
  if (!result?.ordId || !result?.clOrdId) throw new Error('Réponse OKX ordre incomplète : ordId/clOrdId manquant.');
  return { dryRun: false, order, ordId: result.ordId, clOrdId: result.clOrdId || clOrdId, state: result.state || 'submitted' };
}
export async function getOrder(instId, { ordId, clOrdId }) {
  const query = ordId ? `ordId=${q(ordId)}` : `clOrdId=${q(clOrdId)}`;
  const [order] = await okx('GET', `/api/v5/trade/order?instId=${q(instId)}&${query}`);
  return order || null;
}
const ORDER_NOT_FOUND_CODES = new Set(['51603', '51604', '51617']);
export async function findOrderByClOrdId(instId, clOrdId) {
  try { return await getOrder(instId, { clOrdId }); }
  catch (err) {
    const msg = String(err.message || '').toLowerCase();
    if (ORDER_NOT_FOUND_CODES.has(String(err.okxCode)) || msg.includes('order does not exist') || msg.includes("doesn't exist") || msg.includes('order not exist')) return null;
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
export async function orderFill(instId, ordId) { return normalizeOrderFill(await getOrder(instId, { ordId })); }
export async function waitForOrderFill(instId, { ordId, clOrdId }, attempts = 10, delayMs = 1500) {
  let latest = null;
  for (let i = 0; i < attempts; i++) {
    latest = normalizeOrderFill(await getOrder(instId, ordId ? { ordId } : { clOrdId }));
    if (latest.state === 'filled' && latest.filledQty > 0) return latest;
    if (['canceled', 'cancelled', 'rejected'].includes(latest.state)) {
      if (latest.filledQty > 0) { latest.partialTerminal = true; return latest; }
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
export const quoteCurrency = (instId) => instId.split('-')[1];
export const baseCurrency = (instId) => instId.split('-')[0];
export async function assertSpotInstrument(instId) {
  const data = await okx('GET', `/api/v5/public/instruments?instType=SPOT&instId=${q(instId)}`);
  if (!data.length) throw new Error(`La paire ${instId} n'existe pas au comptant sur OKX.`);
  return data[0];
}
export const readJson = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
export const makeClOrdId = () => { throw new Error('clOrdId aléatoire désactivé : utilisez le moteur idempotent.'); };
export const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);
