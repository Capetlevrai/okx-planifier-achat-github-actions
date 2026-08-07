import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runDue = readFileSync(new URL('../scripts/run-due.mjs', import.meta.url), 'utf8');
const reconcilePos = runDue.indexOf('await reconcileExisting(entry, quote)');
const validatePos = runDue.indexOf('validateEntrySafety(entry, plan, history, risk)');
const balancePos = runDue.indexOf('availableBalance(quote)');
const attemptPos = runDue.indexOf('entry.attempts = (entry.attempts || 0) + 1');
const marketBuyPos = runDue.indexOf('marketBuy(entry.instId, entry.amount, entry.clOrdId)');
assert.ok(reconcilePos !== -1, 'run-due must try reconcileExisting');
assert.ok(validatePos !== -1, 'run-due must validate safety before new order');
assert.ok(balancePos !== -1, 'run-due must check balance before new order');
assert.ok(reconcilePos < validatePos, 'reconciliation must happen before whitelist/daily-limit validation');
assert.ok(reconcilePos < balancePos, 'reconciliation must happen before balance check');
assert.ok(attemptPos !== -1 && marketBuyPos !== -1 && attemptPos < marketBuyPos, 'attempt counter must increment exactly once before marketBuy');
assert.equal((runDue.match(/entry\.attempts = \(entry\.attempts \|\| 0\) \+ 1/g) || []).length, 1, 'run-due must increment attempts once');

const okx = readFileSync(new URL('../scripts/okx.mjs', import.meta.url), 'utf8');
assert.ok(okx.includes("latest.state === 'filled'"), 'filled is the only complete success state');
assert.ok(!okx.includes("['filled', 'partially_filled'].includes(latest.state)"), 'partially_filled must not be complete success');
assert.ok(okx.includes('AbortSignal.timeout'), 'OKX fetch calls must have a timeout');

const setup = readFileSync(new URL('../.github/workflows/setup.yml', import.meta.url), 'utf8');
assert.ok(setup.includes('reset_history'), 'setup workflow must expose explicit reset_history option');
assert.ok(setup.includes('reset_history est interdit en compte réel'), 'setup workflow must refuse history reset in real mode');

const dca = readFileSync(new URL('../.github/workflows/dca.yml', import.meta.url), 'utf8');
assert.ok(dca.includes('ALLOW_REAL_TRADING: ${{ secrets.ALLOW_REAL_TRADING }}'), 'real-trading lock must come from a secret, not a normal repository variable');

console.log('workflow/source safety tests OK');
