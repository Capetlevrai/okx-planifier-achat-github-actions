# Voir et arrêter les achats programmés

## Où voir les achats à venir

Le tableau de bord est la vue la plus simple : ouvrez `RAPPORT.md` dans votre
dépôt, puis consultez la section **À venir ou à traiter**. La page
`tableau-de-bord.html` présente la même liste. Le fichier `data/plan.json` est la
source technique du planning ; chaque entrée indique sa date, son montant, sa
paire et son statut.

Dans GitHub, ouvrez **Actions → 2. 💳 ACHATS — Exécuter le planning automatiquement** pour consulter
les contrôles passés et ceux qui sont en cours. GitHub Actions n'affiche pas les
futures échéances comme des ordres en attente : le workflow horaire lit
`data/plan.json`, puis agit uniquement lorsqu'une échéance devient due.

## Couper simplement depuis GitHub

1. Ouvrez votre dépôt GitHub, puis l'onglet **Actions**.
2. Dans la colonne de gauche, choisissez **0. ⛔ ARRÊT D'URGENCE — Couper tous
   les achats**.
3. Cliquez sur **Run workflow**.
4. Dans la confirmation, choisissez **OUI — COUPER LES ACHATS**.
5. Cliquez sur le bouton vert **Run workflow**.
6. Attendez le résultat vert : le workflow d'achat est désactivé et les
   exécutions encore actives ont reçu une demande d'annulation.

La désactivation ou l'annulation d'un workflow ne peut pas annuler un ordre Spot
déjà rempli par OKX.

## Arrêt dur indépendant de GitHub

Pour un arrêt maximal, indépendant de GitHub,
ouvrez la gestion des clés API du compte OKX concerné, puis révoquez la clé du
bot ou retirez-lui la permission **Trading**. Pour un compte Europe/EEE :
[ouvrir les clés API OKX Europe](https://my.okx.com/fr-fr/account/my-api).

Cette action invalide l'accès du bot. Pour reprendre plus tard, créez ou
réactivez une clé conforme, remettez les secrets GitHub à jour, contrôlez le
planning et lancez d'abord un test à blanc. Ne réactivez pas simplement le
workflow sans ces vérifications.

## Arrêt assisté

Vous pouvez demander à votre agent : **« arrête les achats »**. L'agent vérifie
d'abord les opérations en cours, applique les protections prévues par le projet,
puis confirme que les futurs achats sont bloqués.
