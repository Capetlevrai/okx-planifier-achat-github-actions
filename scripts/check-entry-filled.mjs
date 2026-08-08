import { OPERATIONS_FILE, readJson } from './okx.mjs';

const entryId = process.argv[2];
if (!entryId) {
  console.error('Usage: node scripts/check-entry-filled.mjs <entry-id>');
  process.exit(2);
}

const operations = readJson(OPERATIONS_FILE, { schemaVersion: 1, operations: [] });
const op = (operations.operations || []).find((candidate) => candidate.entryId === entryId);

if (!op) {
  console.error(`${entryId}: opération absente du registre`);
  process.exit(3);
}

if (op.state === 'terminal' && op.terminalState === 'filled' && Number(op.executedQuoteAmount) > 0 && Number(op.filledQty) > 0) {
  console.log(`${entryId}: filled — montant exécuté et quantité présents`);
  process.exit(0);
}

if (op.state === 'terminal') {
  console.error(`${entryId}: état terminal non rempli: ${op.terminalState}`);
  process.exit(4);
}

console.error(`${entryId}: pas encore filled — state=${op.state}, okxState=${op.okxState || 'n/a'}`);
process.exit(1);
