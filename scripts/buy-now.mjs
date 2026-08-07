console.error('buy-now.mjs est désactivé : l’achat ponctuel contournait le registre idempotent, les plafonds et le verrou réel. Utilisez uniquement scripts/run-due.mjs avec une opération planifiée et réconciliable.');
process.exit(1);
