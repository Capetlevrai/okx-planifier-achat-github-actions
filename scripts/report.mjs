/**
 * Génère RAPPORT.md à la racine du dépôt : le tableau de bord, en Markdown.
 *
 * Pourquoi pas seulement la page web ? Parce que GitHub Pages exige un dépôt
 * public, et personne ne devrait avoir à exposer ses achats pour les consulter.
 * GitHub rend le Markdown d'un dépôt privé, gratuitement, sans hébergement.
 *
 * Si la variable GITHUB_STEP_SUMMARY existe, le même contenu est aussi affiché
 * dans le récapitulatif du run GitHub Actions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, PLAN_FILE, HISTORY_FILE, readJson } from './okx.mjs';

const plan = readJson(PLAN_FILE, null);
if (!plan) {
  console.error('Aucun planning trouvé.');
  process.exit(1);
}
const history = readJson(HISTORY_FILE, { purchases: [] });

const s = plan.strategy;
const ccy = s.quoteCcy;
const purchases = [...history.purchases].sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt));
const base = (p) => p.baseCcy || p.instId.split('-')[0];

const nf = (v, d = 2) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const money = (v) => `${nf(v)} ${ccy}`;
const day = (iso) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
const relative = (iso) => {
  const d = Math.round((new Date(iso) - Date.now()) / 86400000);
  if (d === 0) return "aujourd'hui";
  if (d === 1) return 'demain';
  return d > 0 ? `dans ${d} j` : `il y a ${Math.abs(d)} j`;
};

const invested = purchases.reduce((n, p) => n + p.amount, 0);
const planned = plan.entries.reduce((n, e) => n + e.amount, 0);
const done = plan.entries.filter((e) => e.status === 'done').length;
const pct = Math.round((done / plan.entries.length) * 100);
const upcoming = plan.entries.filter((e) => e.status === 'pending').sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
const failed = plan.entries.filter((e) => e.status === 'failed');
const next = upcoming[0];
const nextBatch = next ? upcoming.filter((e) => e.dueAt === next.dueAt) : [];

// Jauge d'avancement en caractères pleins : lisible partout, sans image.
const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));

const out = [];
out.push('# Tableau de bord');
out.push('');
out.push(`> **Compte ${plan.demo === false ? 'RÉEL — argent réel' : 'démo — argent fictif'}** · ` +
  `${plan.live === true ? '**achats armés**, les ordres partent' : 'simulation, aucun ordre transmis'}`);
out.push('');
out.push('| | |');
out.push('|---|---|');
out.push(`| **Total investi** | ${money(invested)} sur ${money(planned)} programmés |`);
out.push(`| **Achats effectués** | ${purchases.length} sur ${plan.entries.length} |`);
out.push(`| **Avancement** | \`${bar}\` ${pct} % |`);
out.push(`| **Prochain achat** | ${next ? `${day(next.dueAt)} (${relative(next.dueAt)}) — ${money(nextBatch.reduce((n, e) => n + e.amount, 0))}` : 'plan terminé'} |`);
out.push(`| **Rythme** | ${s.amountPerAsset} ${ccy} par actif, tous les ${s.everyDays} jours, à ${String(s.hourUtc).padStart(2, '0')}h00 UTC |`);
out.push('');

if (purchases.length) {
  const byAsset = new Map();
  for (const p of purchases) {
    const k = base(p);
    const a = byAsset.get(k) ?? { asset: k, qty: 0, spent: 0, n: 0 };
    a.qty += p.filledQty || 0;
    a.spent += p.amount;
    a.n += 1;
    byAsset.set(k, a);
  }
  out.push('## Positions');
  out.push('');
  out.push('| Actif | Quantité | Investi | Prix moyen | Achats |');
  out.push('|---|---:|---:|---:|---:|');
  for (const a of [...byAsset.values()].sort((x, y) => y.spent - x.spent)) {
    out.push(`| **${a.asset}** | ${nf(a.qty, 8)} | ${money(a.spent)} | ${a.qty > 0 ? money(a.spent / a.qty) : '—'} | ${a.n} |`);
  }
  out.push('');

  out.push('## Achats effectués');
  out.push('');
  out.push('| Date | Actif | Montant | Quantité reçue | Prix unitaire | Origine |');
  out.push('|---|---|---:|---:|---:|---|');
  for (const p of purchases) {
    out.push(`| ${day(p.executedAt)} | ${base(p)} | ${money(p.amount)} | ${nf(p.filledQty || 0, 8)} | ${p.avgPrice ? money(p.avgPrice) : '—'} | ${p.source === 'manual' ? 'manuel' : 'planifié'} |`);
  }
  out.push('');
} else {
  out.push('## Achats effectués');
  out.push('');
  out.push('_Aucun achat pour le moment._');
  out.push('');
}

out.push('## Achats à venir');
out.push('');
if (upcoming.length || failed.length) {
  out.push('| Échéance | Actif | Montant | Dans | Statut |');
  out.push('|---|---|---:|---|---|');
  for (const e of [...upcoming, ...failed].sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))) {
    const isFailed = e.status === 'failed';
    const statut = isFailed ? `❌ échec — ${e.error ?? ''}` : nextBatch.includes(e) ? '🔵 prochain' : '⚪ programmé';
    out.push(`| ${day(e.dueAt)} | ${e.instId.split('-')[0]} | ${money(e.amount)} | ${isFailed ? '—' : relative(e.dueAt)} | ${statut} |`);
  }
} else {
  out.push('_Plan terminé._');
}
out.push('');
out.push('---');
out.push('');
out.push(`<sub>Généré le ${new Date().toLocaleString('fr-FR', { timeZone: 'UTC' })} UTC · ` +
  `mis à jour automatiquement après chaque achat · ` +
  `<a href="https://github.com/Capetlevrai/okx-planifier-achat-github-actions">OKX DCA Planner</a></sub>`);
out.push('');

const markdown = out.join('\n');
fs.writeFileSync(path.join(ROOT, 'RAPPORT.md'), markdown);

// Le même contenu s'affiche dans le récapitulatif du run GitHub Actions.
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

console.log('RAPPORT.md mis à jour.');
