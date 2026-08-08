# Tableau de bord

> **Compte démo — argent fictif** · simulation, aucun ordre transmis

| | |
|---|---|
| **Total investi** | 0,00 USDC sur 20,00 USDC programmés |
| **Achats effectués** | 0 sur 2 |
| **Opérations à réconcilier** | 0 |
| **Avancement** | `░░░░░░░░░░░░░░░░░░░░` 0 % |
| **Prochain achat** | 23 août 2026 (dans 15 j) — 10,00 USDC |
| **Rythme** | 10 USDC par actif, tous les 15 jours, à 09h00 UTC |

## Achats effectués

_Aucun achat pour le moment._

## À venir ou à traiter

| Échéance | Actif | Montant | Dans | Statut |
|---|---|---:|---|---|
| 08 août 2026 | BTC | 10,00 USDC | — | ❌ échec — OKX GET /api/v5/trade/order?instId=BTC-USDC&clOrdId=dca3988bc8fe2a45229476c9c6e — HTTP 401 : API key doesn't exist |
| 23 août 2026 | BTC | 10,00 USDC | dans 15 j | 🔵 prochain |

## Voir et arrêter les achats programmés

### Où voir les prochaines échéances

- Le tableau **À venir ou à traiter** ci-dessus est la liste des achats encore programmés.
- Dans GitHub, ouvrez **Actions → 2. Acheter — routine automatique** pour voir les exécutions passées et en cours. GitHub Actions n’affiche pas les futures échéances avant leur lancement : elles restent enregistrées dans `data/plan.json` et présentées ici.

### Couper manuellement

1. Dans le dépôt GitHub, ouvrez **Actions → 2. Acheter — routine automatique**.
2. Ouvrez le menu **⋯** du workflow, puis choisissez **Disable workflow** pour bloquer les prochains contrôles automatiques.
3. Si une exécution est déjà en cours, ouvrez-la et choisissez **Cancel workflow**. Cela ne peut pas annuler un ordre déjà rempli.
4. Pour un arrêt dur indépendant de GitHub, révoquez la clé API du bot sur OKX ou retirez-lui la permission **Trading**.
5. Avant toute reprise, refaites un test à blanc et vérifiez le planning avec votre agent.

> Pour un arrêt assisté, demandez simplement à votre agent : **« arrête les achats »**.

---

### Liens

- [Code source](https://github.com/Capetlevrai/okx-planifier-achat-github-actions)
- [Tutoriel — Trader sur OKX avec une IA](https://coinacademy.fr/academie/okx-agent-trade-kit-trader-sur-okx-avec-une-ia/)
- [OKX Agent Trade Kit](https://github.com/okx/agent-trade-kit)
- [Documentation GitHub Actions](https://docs.github.com/actions)
- [OKX Europe](https://my.okx.com)
- [Historique de trading OKX](https://my.okx.com/fr-fr/balance/report-center/unified/account-history)
- [capetlevrai.com](https://capetlevrai.com) · [coinacademy.fr](https://coinacademy.fr/) · [vibecrypto.org](https://vibecrypto.org)
- Réseaux : [X](https://x.com/capetlevrai) · [Discord](https://discord.gg/VmBa7f9ZAt) · [Twitch](https://www.twitch.tv/capetlevrai) · [YouTube](https://www.youtube.com/@CAPETCRYPTO)

<sub>Généré le 08/08/2026 12:01:41 UTC · mis à jour automatiquement après chaque achat · Réalisé par <a href="https://x.com/capetlevrai">Capetlevrai</a> · <a href="https://github.com/Capetlevrai/okx-planifier-achat-github-actions">OKX DCA Planner</a><br>Données fournies à titre informatif uniquement. Ceci n’est pas un conseil financier.</sub>
