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
const solTestText = read('../.github/workflows/sol-2min-test.yml');
const agentProtocol = read('../AGENTS.md');
const claudeProtocol = read('../CLAUDE.md');
const dca = parseWorkflow('../.github/workflows/dca.yml');
const setup = parseWorkflow('../.github/workflows/setup.yml');
const pages = parseWorkflow('../.github/workflows/pages.yml');
const ci = parseWorkflow('../.github/workflows/ci.yml');
const keepalive = parseWorkflow('../.github/workflows/keepalive.yml');
const solTest = parseWorkflow('../.github/workflows/sol-2min-test.yml');

assert.ok(agentProtocol.includes('Les **deux premières questions sont obligatoirement posées en premier'), 'agent flow must start with mode and region');
assert.ok(agentProtocol.includes('Démo (argent fictif)') && agentProtocol.includes('Argent réel'), 'mode choices must be explicit');
assert.ok(agentProtocol.includes('Europe/EEE') && agentProtocol.includes('États-Unis') && agentProtocol.includes('Turquie') && agentProtocol.includes('Ailleurs'), 'region choices must be explicit');
assert.ok(agentProtocol.includes('Créer un sous-compte dédié') && agentProtocol.includes('Utiliser mon compte principal'), 'real flow must offer account isolation before API credentials');
assert.ok(agentProtocol.includes("N'ouvre jamais le navigateur intégré pour OKX"), 'agent must hand off sensitive OKX pages to the user browser');
assert.ok(agentProtocol.includes('Ne demande jamais une clé, un secret ou une passphrase dans le chat'), 'agent must not collect OKX credentials in chat');
assert.ok(claudeProtocol.includes('choix interactifs Démo/Argent réel puis Région'), 'Claude entrypoint must preserve the interactive flow');

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

for (const workflow of [dca, setup, pages, ci, keepalive, solTest]) {
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
assert.ok(keepaliveText.includes("cron: '0 6 * * *'"), 'keepalive must run daily, safely below the OKX 14-day inactivity window');
assert.ok(!keepaliveText.includes('workflow_dispatch'), 'keepalive must not be manually dispatchable with secrets from arbitrary branches');
assert.ok(keepaliveText.includes('node scripts/keepalive.mjs'), 'keepalive workflow must call the dedicated keepalive script');
assert.ok(!keepaliveText.includes('ALLOW_REAL_TRADING'), 'keepalive must never require or expose the real-trading arming secret');
assert.ok(!keepaliveText.includes('real-trading'), 'keepalive must stay non-ordering and not wait for trading approvals');

const keepaliveScript = read('../scripts/keepalive.mjs');
assert.ok(keepaliveScript.includes('/api/v5/account/balance'), 'keepalive must use an authenticated account endpoint');
assert.ok(!keepaliveScript.includes('/api/v5/trade/order'), 'keepalive must never place an order');
assert.ok(!keepaliveScript.includes('marketBuy'), 'keepalive must never call marketBuy');

assert.equal(solTest.permissions.contents, 'read', 'temporary SOL workflow must not have write permission to publish private order state');
assert.equal(solTest.concurrency.group, 'okx-dca-state');
assert.equal(solTest.jobs['sol-real-test'].environment, 'real-trading');
assert.ok(solTest.jobs['sol-real-test'].if.includes('[sol-real-test]'), 'temporary SOL workflow must require an explicit commit-message fuse');
assert.ok(solTest.jobs['sol-real-test'].if.includes('github.run_attempt == 1'), 'temporary SOL workflow must skip GitHub reruns');
assert.ok(!solTestText.includes('workflow_dispatch'), 'temporary SOL workflow must not be manually dispatchable from arbitrary branches');
assert.ok(!solTestText.includes('git push'), 'temporary SOL workflow must not publish private order state');
assert.ok(!solTestText.includes('git commit'), 'temporary SOL workflow must not commit private order state');
assert.ok(!solTestText.includes('node scripts/report.mjs'), 'temporary SOL workflow must not publish detailed order reports for a public repo');
assert.ok(solTestText.includes('npm ci --ignore-scripts'), 'real-money workflow must not run dependency install scripts');
assert.ok(solTestText.includes('sleep 130'), 'temporary SOL workflow must wait for the second two-minute due entry');
assert.ok(solTestText.includes("DRY_RUN: '0'"), 'temporary SOL workflow must explicitly execute the armed live plan, not an implicit default');
assert.ok(solTestText.includes('node scripts/prepare-sol-2min-test.mjs'), 'temporary SOL workflow must prepare due times at runtime');
assert.ok(solTestText.includes('node scripts/ensure-trading-usdc.mjs'), 'temporary SOL workflow must ensure Trading USDC before live buys');
assert.ok(solTestText.includes('ALLOW_REAL_TRADING manquant ou incorrect'), 'temporary SOL workflow must fail-fast if the real-trading fuse is unset');
assert.ok(solTestText.includes('node scripts/check-entry-filled.mjs sol-real-2min-test-1-SOL-USDC'));
assert.ok(solTestText.includes('node scripts/check-entry-filled.mjs sol-real-2min-test-2-SOL-USDC'));
assert.ok(solTestText.includes('node scripts/run-due.mjs || true'), 'temporary SOL workflow must retry/reconcile transient OKX states');
const ensureTrading = read('../scripts/ensure-trading-usdc.mjs');
assert.ok(ensureTrading.includes('transferFundingToTrading'), 'ensure-trading must attempt Funding→Trading when needed');
assert.ok(ensureTrading.includes('bucket='), 'ensure-trading must not print exact balances');
assert.ok(!ensureTrading.includes('console.log(trading)'), 'ensure-trading must not dump raw balances');
const engineText = read('../scripts/engine.mjs');
assert.ok(!engineText.includes('solde ${quoteCurrency(entry.instId)}: ${balance}'), 'real-money logs must not expose exact balances in public Actions logs');
const solPrepare = read('../scripts/prepare-sol-2min-test.mjs');
assert.ok(solPrepare.includes("instIds: ['SOL-USDC']"));
assert.ok(solPrepare.includes('maxPlanQuoteAmount: 2'));
assert.ok(solPrepare.includes('maxLifetimeQuoteAmount: 2'));
assert.ok(solPrepare.includes('priorRealPurchase') && solPrepare.includes('priorRealSubmitted'), 'temporary SOL script must refuse accidental reruns after real activity');
assert.ok(solPrepare.includes('currentPlanIsThisTest') && solPrepare.includes('priorThisTestOperation'), 'temporary SOL script must refuse reruns when the same test plan or operations are already present');
assert.ok(dcaText.includes('extract-workflow-shell.mjs'), 'shellcheck must use the YAML parser based extractor');
assert.ok(ciText.includes('pull_request') && ciText.includes('npm test'), 'push/PR quality gate is required');
assert.equal(pages.jobs.build.permissions, undefined, 'build inherits contents:read only');
assert.equal(pages.jobs.deploy.permissions.pages, 'write');
assert.equal(pages.jobs.deploy.permissions['id-token'], 'write');
assert.ok(pages.jobs.deploy.environment?.name === 'github-pages');

console.log('workflow/source safety tests OK');
