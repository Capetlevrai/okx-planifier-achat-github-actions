# Tableau de bord

> **Compte démo — argent fictif** · simulation, aucun ordre transmis
>
> 🗓️ **Aucun achat configuré.** Ouvrez **Actions → 1. 🗓️ PLANNING — Créer ou modifier mes achats** pour commencer.

| | |
|---|---|
| **Total investi** | 0,00 USDC sur 0,00 USDC programmés |
| **Achats effectués** | 0 sur 0 |
| **Opérations à réconcilier** | 0 |
| **Avancement** | `░░░░░░░░░░░░░░░░░░░░` 0 % |
| **Prochain achat** | plan terminé |
| **Rythme** | 0 USDC par actif, tous les 15 jours, à 09h00 UTC |

## Achats effectués

_Aucun achat pour le moment._

## À venir ou à traiter

_Plan terminé._

## Voir et arrêter les achats programmés

### Où voir les prochaines échéances

- Le tableau **À venir ou à traiter** ci-dessus est la liste des achats encore programmés.
- Dans GitHub, ouvrez **Actions → 2. 💳 ACHATS — Exécuter le planning automatiquement** pour voir les exécutions passées et en cours. GitHub Actions n’affiche pas les futures échéances avant leur lancement : elles restent enregistrées dans `data/plan.json` et présentées ici.

### Couper manuellement

1. Dans le dépôt GitHub, ouvrez **Actions → 0. ⛔ ARRÊT D’URGENCE — Couper tous les achats**.
2. Cliquez **Run workflow**, choisissez **OUI — COUPER LES ACHATS**, puis confirmez avec le bouton vert **Run workflow**.
3. Le système désactive automatiquement les prochains achats et tente d’annuler les exécutions encore actives. Cela ne peut pas annuler un ordre déjà rempli.
4. Pour un arrêt maximal indépendant de GitHub, révoquez ensuite la clé API du bot sur OKX ou retirez-lui la permission **Trading**.
5. Avant toute reprise, demandez à votre agent de vérifier le planning et de lancer un test à blanc.

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

<sub>Généré le 14/08/2026 15:42:23 UTC · mis à jour automatiquement après chaque achat · Réalisé par <a href="https://x.com/capetlevrai">Capetlevrai</a> · <a href="https://github.com/Capetlevrai/okx-planifier-achat-github-actions">OKX DCA Planner</a><br>Données fournies à titre informatif uniquement. Ceci n’est pas un conseil financier.</sub>
