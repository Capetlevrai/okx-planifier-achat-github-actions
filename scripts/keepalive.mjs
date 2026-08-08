import { pathToFileURL } from 'node:url';
import { PLAN_FILE, availableBalance, configure, currentBaseUrl, isDemo, log, quoteCurrency, readJson, requireCredentials } from './okx.mjs';

export function keepaliveCurrency(plan) {
  const configured = plan?.strategy?.quoteCcy;
  if (typeof configured === 'string' && configured.trim()) return configured.trim().toUpperCase();

  const firstPair = plan?.strategy?.instIds?.[0] || plan?.risk?.allowedInstIds?.[0] || plan?.entries?.[0]?.instId;
  if (!firstPair) throw new Error('Impossible de déterminer la devise à vérifier pour le keepalive OKX.');
  return quoteCurrency(firstPair).toUpperCase();
}

export async function runKeepalive(plan) {
  configure(plan);
  requireCredentials();

  const ccy = keepaliveCurrency(plan);
  const accountLabel = isDemo() ? 'DÉMO (argent fictif)' : 'RÉEL (argent réel)';
  log(`Keepalive OKX — compte ${accountLabel} · ${currentBaseUrl().replace('https://', '')} — appel authentifié solde ${ccy}, aucun ordre envoyé.`);
  await availableBalance(ccy);
  log(`Keepalive OKX réussi — endpoint authentifié /api/v5/account/balance?ccy=${ccy} — aucun ordre envoyé.`);
}

async function main() {
  const plan = readJson(PLAN_FILE, null);
  if (!plan) throw new Error('Plan introuvable : lancez d’abord le workflow de configuration.');
  await runKeepalive(plan);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
