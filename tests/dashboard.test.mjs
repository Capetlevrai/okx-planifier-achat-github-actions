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
assert.ok(dashboard.includes('https://my.okx.com/fr-fr/balance/report-center/unified/account-history'), 'LIVE real dashboard must deep-link to OKX account history');
assert.ok(dashboard.includes('id="okx-history-link"'), 'OKX history link slot must exist under completed purchases');
assert.ok(dashboard.includes('!demo&&plan.live'), 'OKX history link is shown only for real LIVE plans');
assert.ok(dashboard.includes('class="fgrid"') && dashboard.includes('class="socials"') && dashboard.includes('class="legal"'), 'dashboard footer must keep the full demo-style layout');
assert.ok(dashboard.includes('https://x.com/capetlevrai') && dashboard.includes('discord.gg/VmBa7f9ZAt') && dashboard.includes('twitch.tv/capetlevrai') && dashboard.includes('youtube.com/@CAPETCRYPTO'), 'footer must include Capetlevrai social links');
assert.ok(dashboard.includes('capetlevrai.com') && dashboard.includes('coinacademy.fr') && dashboard.includes('vibecrypto.org'), 'footer must include partner links');
assert.ok(dashboard.includes('OKX Agent Trade Kit') && dashboard.includes('Documentation GitHub Actions'), 'footer must include getting-started links');
assert.ok(dashboard.includes('Ceci n’est pas un conseil financier') || dashboard.includes("Ceci n'est pas un conseil financier"), 'footer legal disclaimer required');
assert.ok(dashboard.includes('Réalisé par'), 'footer must credit Capetlevrai');
assert.ok(report.includes('my.okx.com/fr-fr/balance/report-center/unified/account-history'), 'Markdown LIVE real report must deep-link to OKX account history');
assert.ok(report.includes('x.com/capetlevrai') && report.includes('Réalisé par'), 'Markdown footer must include Capetlevrai credit and socials');
assert.ok(report.includes('${done} sur ${plan.entries.length}'), 'Markdown completed count must exclude failed terminal audit rows');
assert.ok(report.includes('p.demo !== undefined ? p.demo === planDemo : planDemo'), 'Markdown report must filter history by active demo/real account');
assert.ok(dashboard.includes('p.demo!==undefined?p.demo===demo:demo'), 'Web dashboard must filter history by active demo/real account');
assert.ok(report.includes('opération(s) à traiter'), 'Markdown must surface unresolved failures');
const standaloneTemplate = standalone.replace(/<script>window\.__DCA__ = .*?;<\/script>\r?\n/, '');
assert.equal(standaloneTemplate, dashboard, 'standalone dashboard must be regenerated from the current responsive template');

console.log('dashboard UX source tests OK');
