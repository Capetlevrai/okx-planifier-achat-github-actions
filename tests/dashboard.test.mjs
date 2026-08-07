import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');
const dashboard = read('../site/index.html');
const standalone = read('../tableau-de-bord.html');
const report = read('../scripts/report.mjs');

assert.ok(dashboard.includes('name="viewport" content="width=device-width, initial-scale=1"'));
assert.ok(dashboard.includes('id="page-title"') && dashboard.includes('id="page-lead"'));
assert.ok(dashboard.includes('document.title=`OKX DCA'), 'title must be derived from the active plan');
assert.ok(dashboard.includes("assets.join(' + ')"), 'asset summary must be dynamic');
assert.ok(!dashboard.includes('BTC + ETH, 50 USDC'), 'dashboard must not contain stale hard-coded plan details');
assert.ok(dashboard.includes("failed.length?'attention requise':'plan terminé'"), 'failed plans must not be presented as completed');
assert.ok(dashboard.includes('e.error?'), 'failure reason must be visible in the dashboard');
assert.ok(dashboard.includes('overflow-x:auto'), 'tables must remain usable in a narrow mobile viewport');
assert.ok(dashboard.includes('Mode actuel : compte démo OKX') && dashboard.includes('Attention : compte OKX réel'));
assert.ok(report.includes('${done} sur ${plan.entries.length}'), 'Markdown completed count must exclude failed terminal audit rows');
assert.ok(report.includes('opération(s) à traiter'), 'Markdown must surface unresolved failures');
const standaloneTemplate = standalone.replace(/<script>window\.__DCA__ = .*?;<\/script>\n/, '');
assert.equal(standaloneTemplate, dashboard, 'standalone dashboard must be regenerated from the current responsive template');

console.log('dashboard UX source tests OK');
