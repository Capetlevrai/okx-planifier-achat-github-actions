/**
 * Garantit un solde Trading USDC suffisant pour le test réel (défaut : 2 USDC).
 * - Ne log jamais un solde exact (buckets uniquement).
 * - Tente un transfert Funding → Trading si la clé a la permission Transfer.
 * - Sinon, échoue avec une consigne claire (transfert manuel OKX).
 */
import {
  PLAN_FILE,
  availableBalance,
  configure,
  fundingBalance,
  log,
  modeLabel,
  readJson,
  requireCredentials,
  transferFundingToTrading,
} from './okx.mjs';

const REQUIRED = Number(process.env.REQUIRED_TRADING_USDC || 2);
if (!Number.isFinite(REQUIRED) || REQUIRED <= 0) {
  console.error('REQUIRED_TRADING_USDC invalide.');
  process.exit(1);
}

const plan = readJson(PLAN_FILE, null);
if (!plan) {
  console.error('Aucun plan trouvé. Lancez d’abord prepare-sol-2min-test.mjs.');
  process.exit(1);
}

try {
  configure(plan);
} catch (error) {
  console.error(`Échec de configuration sécurisée : ${error.message}`);
  process.exit(1);
}

requireCredentials();
log(`Vérification solde Trading USDC — ${modeLabel()}`);

function bucket(n) {
  const v = Number(n) || 0;
  if (v <= 0) return 'zero';
  if (v < REQUIRED) return 'under-required';
  if (v < REQUIRED * 2) return 'ok-tight';
  return 'ok';
}

try {
  let trading = await availableBalance('USDC');
  log(`Solde Trading USDC : bucket=${bucket(trading)} (seuil requis=${REQUIRED} USDC, valeur exacte non affichée)`);

  if (trading >= REQUIRED) {
    log('Solde Trading suffisant — aucun transfert nécessaire.');
    process.exit(0);
  }

  let funding = 0;
  try {
    funding = await fundingBalance('USDC');
  } catch (error) {
    console.error(`Impossible de lire le compte Funding : ${error.message}`);
    process.exit(1);
  }

  log(`Solde Funding USDC : bucket=${bucket(funding)}`);

  if (funding < REQUIRED) {
    console.error(
      `Fonds insuffisants : Trading et Funding sous le seuil de ${REQUIRED} USDC. ` +
        'Alimentez le sous-compte puis relancez.',
    );
    process.exit(1);
  }

  // Transférer juste ce qu'il faut + petite marge (sans dépasser le funding dispo).
  const need = Math.min(funding, Math.max(REQUIRED, REQUIRED + 1));
  log(`Tentative de transfert Funding → Trading (montant plafonné, non loggé en clair)…`);
  try {
    await transferFundingToTrading('USDC', need);
  } catch (error) {
    const msg = String(error.message || error);
    if (msg.includes('50120') || msg.toLowerCase().includes("doesn't have permission") || msg.toLowerCase().includes('permission')) {
      console.error(
        'Transfert API refusé : la clé n’a pas la permission Transfer. ' +
          'Dans OKX (sous-compte) : Actifs → Transfert → Funding → Trading, déplacez au moins ' +
          `${REQUIRED} USDC, puis relancez le test. ` +
          'Ou recréez une clé API avec Trade + Transfer.',
      );
      process.exit(1);
    }
    console.error(`Échec du transfert Funding → Trading : ${msg}`);
    process.exit(1);
  }

  trading = await availableBalance('USDC');
  log(`Après transfert — Solde Trading USDC : bucket=${bucket(trading)}`);
  if (trading < REQUIRED) {
    console.error(`Après transfert, le solde Trading reste sous ${REQUIRED} USDC.`);
    process.exit(1);
  }
  log('Solde Trading suffisant après transfert.');
  process.exit(0);
} catch (error) {
  console.error(`Échec ensure-trading-usdc : ${error.message}`);
  process.exit(1);
}
