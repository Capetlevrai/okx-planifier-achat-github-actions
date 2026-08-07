import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runDue = readFileSync(new URL('../scripts/run-due.mjs', import.meta.url), 'utf8');
assert.ok(runDue.includes('runPlanner'), 'run-due must use the idempotent orchestration engine');
assert.ok(runDue.includes('OPERATIONS_FILE'), 'run-due must persist a durable operations registry');
assert.ok(runDue.includes('ALLOW_REAL_TRADING'), 'real-money lock must remain explicit');

const engine = readFileSync(new URL('../scripts/engine.mjs', import.meta.url), 'utf8');
assert.ok(engine.includes('reconcileOperation'), 'engine must expose reconciliation');
assert.ok(engine.indexOf('for (const op of operations.operations.filter') < engine.indexOf('validateEntrySafety(entry'), 'reconciliation pass must run before new-order safety/preflight');
assert.ok(engine.includes('submissionAttempts'), 'engine must track submission attempts separately');
assert.ok(engine.includes('reconciliationAttempts'), 'engine must track reconciliation attempts separately');
assert.ok(engine.includes('preflightFailures'), 'engine must track preflight failures separately');
assert.ok(engine.includes('atomicWriteJson'), 'state writes must be atomic');

const okx = readFileSync(new URL('../scripts/okx.mjs', import.meta.url), 'utf8');
assert.ok(okx.includes('validateAllowedBaseUrl'), 'OKX base URL must be allowlisted');
assert.ok(okx.includes("item.sCode !== undefined && item.sCode !== '0'"), 'OKX item-level sCode must be validated');
assert.ok(okx.includes('réponse non JSON'), 'OKX client must reject non-JSON responses');
assert.ok(okx.includes('ordId/clOrdId manquant'), 'OKX order response must require identifiers');

const setup = readFileSync(new URL('../.github/workflows/setup.yml', import.meta.url), 'utf8');
assert.ok(setup.includes('concurrency:'), 'setup workflow must share a concurrency group');
assert.ok(setup.includes('PAIRES:'), 'setup inputs must be passed through env, not interpolated directly in shell commands');
assert.ok(setup.includes('reset_history est interdit en compte réel'), 'setup workflow must refuse history reset in real mode');

const dca = readFileSync(new URL('../.github/workflows/dca.yml', import.meta.url), 'utf8');
assert.ok(dca.includes('environment: real-trading'), 'financial job must be attached to the protected real-trading environment');
assert.ok(dca.includes('needs: quality-gate'), 'financial job must depend on a secret-free quality gate');
assert.ok(dca.includes('ALLOW_REAL_TRADING: ${{ secrets.ALLOW_REAL_TRADING }}'), 'real-trading lock must come from a secret');
assert.ok(dca.includes('git pull --rebase'), 'state push must rebase before pushing');

console.log('workflow/source safety tests OK');
