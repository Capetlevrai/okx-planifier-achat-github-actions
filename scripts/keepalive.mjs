import { PLAN_FILE, availableBalance, configure, currentBaseUrl, isDemo, log, quoteCurrency, readJson, requireCredentials } from './okx.mjs';

function keepaliveCurrency(plan) {
  const configured = plan?.strategy?.quoteCcy;
  if (typeof configured === 'string' && configured.trim()) return configured.trim().toUpperCase();

  const firstPair = plan?.strategy?.instIds?.[0] || plan?.risk?.allowedInstIds?.[0] || plan?.entries?.[0]?.instId;
  if (!firstPair) throw new Error('Impossible de déterminer la devise à vérifier pour le keepalive OKX.');
  return quoteCurrency(firstPair).toUpperCase();
}

async function main() {
  const plan = readJson(PLAN_FILE, null);
  if (!plan) throw new Error('Plan introuvable : lancez d’abord le workflow de configuration.');

  configure(plan);
  requireCredentials();

  const ccy = keepaliveCurrency(plan);
  const accountLabel = isDemo() ? 'DÉMO (argent fictif)' : 'RÉEL (argent réel)';
  log(`Keepalive OKX — compte ${accountLabel} · ${currentBaseUrl().replace('https://', '')} — appel authentifié solde ${ccy}, aucun ordre envoyé.`);
  const balance = await availableBalance(ccy);
  log(`Keepalive OKX réussi — endpoint authentifié /api/v5/account/balance?ccy=${ccy} — solde disponible lu : ${balance} ${ccy}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
