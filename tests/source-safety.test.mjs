import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const parseWorkflow = (relative) => parse(read(relative));
const fullSha = /^[^@]+@[a-f0-9]{40}$/;

const runDue = read('../scripts/run-due.mjs');
assert.ok(runDue.includes('runPlanner'), 'run-due must use the idempotent orchestration engine');
assert.ok(runDue.includes('OPERATIONS_FILE'), 'run-due must persist a durable operations registry');
assert.ok(runDue.includes('realTradingArmed'), 'run-due must pass the real-money gate into the engine');

const engine = read('../scripts/engine.mjs');
const reconciliationPass = engine.indexOf('// Les seules opérations globalement réconciliées');
const dueLoop = engine.indexOf('for (const entry of plan.entries)', reconciliationPass);
assert.ok(reconciliationPass !== -1 && dueLoop > reconciliationPass, 'ambiguous reconciliation pass must precede due-entry processing');
assert.ok(!engine.includes('idempotent_resubmit_attempt'), 'ambiguous operations must never be retransmitted automatically');
assert.ok(engine.includes('ordre ambigu introuvable') && engine.includes('aucun nouveau POST'), 'ambiguous not-found operations must remain reconciliation-only');
assert.ok(engine.includes('atomicWriteJson'), 'state writes must be atomic');

const okx = read('../scripts/okx.mjs');
assert.ok(okx.includes('validateAllowedBaseUrl'), 'OKX base URL must be allowlisted');
assert.ok(okx.includes("item.sCode !== undefined && item.sCode !== '0'"), 'OKX item-level sCode must be validated');
assert.ok(okx.includes('Réponse OKX ordre incohérente'), 'OKX order response must preserve the requested clOrdId');
assert.ok(okx.includes('publicGet'), 'public instrument validation must not need trading credentials');

const dcaText = read('../.github/workflows/dca.yml');
const setupText = read('../.github/workflows/setup.yml');
const pagesText = read('../.github/workflows/pages.yml');
const ciText = read('../.github/workflows/ci.yml');
const keepaliveText = read('../.github/workflows/keepalive.yml');
const dca = parseWorkflow('../.github/workflows/dca.yml');
const setup = parseWorkflow('../.github/workflows/setup.yml');
const pages = parseWorkflow('../.github/workflows/pages.yml');
const ci = parseWorkflow('../.github/workflows/ci.yml');
const keepalive = parseWorkflow('../.github/workflows/keepalive.yml');

assert.equal(dca.concurrency.group, 'okx-dca-state');
assert.equal(setup.concurrency.group, 'okx-dca-state');
assert.deepEqual(dca.jobs['execute-demo'].needs, ['quality-gate', 'inspect']);
assert.deepEqual(dca.jobs['execute-real'].needs, ['quality-gate', 'inspect']);
assert.equal(setup.jobs.configurer.needs, 'quality-gate');
assert.equal(dca.jobs.inspect.if, "github.ref == 'refs/heads/main'");
assert.equal(dca.jobs['execute-demo'].if, "needs.inspect.outputs.account == 'demo'");
assert.equal(dca.jobs['execute-real'].if, "needs.inspect.outputs.account == 'real'");
assert.equal(setup.jobs.configurer.if, "github.ref == 'refs/heads/main'");
assert.equal(dca.jobs['execute-demo'].environment, undefined, 'demo must not wait for the protected real environment');
assert.equal(dca.jobs['execute-real'].environment, 'real-trading');
assert.equal(dca.jobs['execute-real'].env, undefined, 'financial secrets must not be exposed at job scope');
assert.equal(dca.jobs['quality-gate'].permissions.contents, 'read');
assert.equal(setup.jobs['quality-gate'].permissions.contents, 'read');
const demoStep = dca.jobs['execute-demo'].steps.find((step) => step.name === 'Exécuter les achats démo dus');
const realStep = dca.jobs['execute-real'].steps.find((step) => step.name === 'Exécuter ou réconcilier le plan réel');
assert.ok(demoStep && realStep, 'demo/real execution steps missing');
for (const secretName of ['OKX_API_KEY', 'OKX_SECRET_KEY', 'OKX_PASSPHRASE']) {
  assert.match(demoStep.env[secretName], /secrets\./, `${secretName} must be scoped to the demo execution step`);
  assert.match(realStep.env[secretName], /secrets\./, `${secretName} must be scoped to the real execution step`);
}
assert.equal(demoStep.env.ALLOW_REAL_TRADING, undefined);
assert.match(realStep.env.ALLOW_REAL_TRADING, /secrets\./);
assert.ok(!setupText.includes('secrets.OKX_'), 'setup workflow must not expose trading secrets to plan inputs or public checks');
assert.ok(setupText.includes('reset_history est interdit en compte réel'));
assert.ok(!setupText.includes('data/operations.json\n'), 'setup must never rewrite the operation registry through a literal reset');

for (const workflow of [dca, setup, pages, ci, keepalive]) {
  for (const job of Object.values(workflow.jobs || {})) {
    for (const step of job.steps || []) {
      if (step.uses) assert.match(step.uses, fullSha, `action must be pinned to a full SHA: ${step.uses}`);
      if (typeof step.run === 'string') assert.ok(!step.run.includes('${{ inputs.'), 'workflow inputs must enter shell only through env');
    }
  }
}

assert.ok(dcaText.includes("cron: '0 * * * *'"), 'hourly scheduler must match 60-minute retry cadence');
assert.equal(keepalive.permissions.contents, 'read');
assert.equal(keepalive.concurrency.group, 'okx-dca-keepalive');
assert.ok(keepaliveText.includes("cron: '0 6 */2 * *'"), 'keepalive must run every 48h-ish, safely below the OKX 14-day inactivity window');
assert.ok(keepaliveText.includes('node scripts/keepalive.mjs'), 'keepalive workflow must call the dedicated keepalive script');
assert.ok(!keepaliveText.includes('ALLOW_REAL_TRADING'), 'keepalive must never require or expose the real-trading arming secret');
assert.ok(!keepaliveText.includes('real-trading'), 'keepalive must stay non-ordering and not wait for trading approvals');

const keepaliveScript = read('../scripts/keepalive.mjs');
assert.ok(keepaliveScript.includes('/api/v5/account/balance'), 'keepalive must use an authenticated account endpoint');
assert.ok(!keepaliveScript.includes('/api/v5/trade/order'), 'keepalive must never place an order');
assert.ok(!keepaliveScript.includes('marketBuy'), 'keepalive must never call marketBuy');
assert.ok(dcaText.includes('extract-workflow-shell.mjs'), 'shellcheck must use the YAML parser based extractor');
assert.ok(ciText.includes('pull_request') && ciText.includes('npm test'), 'push/PR quality gate is required');
assert.equal(pages.jobs.build.permissions, undefined, 'build inherits contents:read only');
assert.equal(pages.jobs.deploy.permissions.pages, 'write');
assert.equal(pages.jobs.deploy.permissions['id-token'], 'write');
assert.ok(pages.jobs.deploy.environment?.name === 'github-pages');

console.log('workflow/source safety tests OK');
