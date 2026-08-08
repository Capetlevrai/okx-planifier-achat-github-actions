# Parcours guidé — installer et tester le plan OKX

Ce document décrit ce que l'agent doit expliquer à une personne qui découvre
OKX, les clés API et GitHub Actions. L'utilisateur ne doit jamais recevoir une
question sèche ni avoir à deviner où cliquer.

## Ce qui va se passer

L'installation suit neuf étapes : choix du mode, région, isolation du budget,
création de la clé, définition du plan, dépôt GitHub privé, test à blanc,
confirmation éventuelle de l'argent réel, puis liens de suivi. Un choix
« Argent réel » ne déclenche pas un achat : le plan reste désarmé jusqu'à la
confirmation explicite donnée juste avant l'exécution.

Les secrets OKX ne sont jamais collés dans le chat, enregistrés dans le dépôt
ou montrés dans une capture. Ils sont saisis directement dans un canal local
masqué ou dans les secrets chiffrés de l'environnement GitHub
`real-trading`.

## 1. Démo ou argent réel

L'agent explique que le mode Démo utilise des fonds fictifs et permet de tester
le parcours sans risque. Le mode Argent réel utilise le solde Spot du compte,
mais l'installation et le premier test restent en simulation. Il demande ensuite
un seul choix : **Démo** ou **Argent réel**.

## 2. Région du compte

La région choisit le domaine OKX et l'API correspondante. Une clé créée sur un
site ne fonctionne pas sur un autre ; un mauvais choix provoque souvent
`50119 API key doesn't exist`. L'agent demande où le compte est réellement
ouvert : Europe/EEE, États-Unis, Turquie ou ailleurs.

## 3. Sous-compte dédié ou compte principal

Cette étape apparaît avant toute création de clé en argent réel.

Un sous-compte est un compartiment séparé rattaché au compte OKX principal. Il
sert à isoler uniquement le budget accepté pour le plan. C'est le choix
recommandé : la clé du bot voit le solde Trading de ce sous-compte au lieu du
solde Trading principal.

Le compte principal reste possible, mais sa clé accède directement à son solde
Trading. L'agent doit l'annoncer clairement et recommander de ne laisser sur ce
compte que le budget assumé.

### Si vous choisissez un sous-compte en Europe

1. Ouvrez [la gestion des sous-comptes OKX Europe](https://my.okx.com/fr-fr/account/sub-account).
2. Connectez-vous si nécessaire ; OKX doit ensuite revenir à la page demandée.
3. Cliquez **Créer un sous-compte** et choisissez **Standard**, pas « Managed
   trading ».
4. Donnez-lui un nom reconnaissable, par exemple `dca-github`, puis confirmez
   avec la 2FA.
5. Ouvrez [le transfert du compte principal vers le sous-compte](https://my.okx.com/fr-fr/balance/sub-transfer).
6. Transférez vers ce sous-compte uniquement le total du plan, avec une petite
   marge pour les frais.
7. Vérifiez ensuite le solde **Trading** du sous-compte. Si les fonds sont dans
   **Funding / Financement**, ouvrez [le transfert Funding → Trading](https://my.okx.com/fr-fr/balance/transfer)
   et déplacez-les vers Trading avant de créer la clé API.

Documentation officielle : [qu'est-ce qu'un sous-compte ?](https://www.okx.com/fr-fr/help/what-is-a-sub-account)

## 4. Créer la clé API sur le bon compte

Une fois le compte choisi et le budget isolé, ouvrez
[la page des clés API OKX Europe](https://my.okx.com/fr-fr/account/my-api).

Dans le formulaire :

1. cliquez **Créer une clé API** ;
2. donnez-lui un nom explicite, par exemple `github-dca` ;
3. dans **Compte**, sélectionnez le sous-compte dédié ou vérifiez que le compte
   principal est bien celui voulu ;
4. choisissez l'utilisation **API trading** ;
5. activez **Lecture + Trading** ;
6. n'activez jamais **Retrait** ;
7. créez une passphrase unique et terminez la vérification 2FA.

GitHub Actions utilise des runners dont l'adresse IP change. Une liste IP fixe
ne peut donc pas être fournie pour ce mode d'exécution. En contrepartie, le
projet limite les paires et montants, utilise un verrou d'armement séparé géré
par l'agent et maintient la clé active par un appel de solde sans ordre.

Conservez localement les trois valeurs affichées par OKX — clé, secret et
passphrase — sans les envoyer dans la conversation. Si l'une d'elles a été
collée dans un chat ou une capture partagée, révoquez la clé et recommencez.

Documentation officielle : [FAQ sous-comptes et connexions API](https://www.okx.com/fr-fr/help/subaccounts-account-mode-and-api-connections-faq)
et [FAQ des clés API](https://www.okx.com/en-eu/help/api-faq).

## 5. Définir le plan

L'agent reprend les informations déjà fournies au lieu de les redemander :

- `SOL-USDC` signifie acheter SOL en dépensant des USDC ;
- le montant est dépensé par actif et par échéance ;
- « maintenant puis dans 15 jours » signifie exactement deux échéances ;
- avant tout armement, l'agent affiche les deux dates et le total engagé.

Exemple : 5 USDC maintenant + 5 USDC dans 15 jours = **2 achats** et
**10 USDC maximum au total**, hors petite variation liée aux frais ou au marché.

## 6. Créer le dépôt GitHub privé

Le dépôt privé contient le planning, les scripts et l'historique généré. Il ne
contient jamais les clés. Les identifiants OKX sont ajoutés comme secrets de
l'environnement GitHub protégé `real-trading`.

L'agent donne ensuite le lien du dépôt et explique où consulter `RAPPORT.md`.
Il ne rend pas le dépôt public sans demande explicite.

## 7. Tester à blanc

Le premier workflow force `dry_run=1`. Il vérifie la clé, le prix, le solde, la
paire et l'échéance, mais n'envoie aucun ordre. L'agent montre et résume les logs
en distinguant clairement « vérifié » de « acheté ».

## 8. Confirmer séparément l'argent réel

Après un test vert, l'agent récapitule l'actif, le montant par achat, les dates,
le nombre d'ordres, le total maximal, le compte et la procédure d'arrêt. Il
attend ensuite une phrase affirmative explicite. Une ancienne demande telle que
« configure tout » ou « je veux du réel » ne vaut pas confirmation finale.

## 9. Vérifier et arrêter

Après un ordre, l'agent ne se contente pas d'un workflow vert : il vérifie que
l'ordre est réellement `filled`, puis remet deux liens : le tableau de bord et
[l'historique Spot OKX Europe](https://my.okx.com/fr-fr/balance/report-center/unified/account-history).

Pour bloquer immédiatement tout nouvel ordre réel, demandez à l'agent d'arrêter
les achats. Il retire d'abord le verrou d'armement technique, puis désactive le
workflow `dca.yml`, sans vous demander de manipuler un secret.

## Liens directs pour les autres régions

| Région | Sous-comptes | Transferts | Clés API |
|---|---|---|---|
| États-Unis | [Sous-comptes US](https://us.okx.com/account/sub-account) | [Transferts US](https://us.okx.com/balance/transfer) | [Clés API US](https://us.okx.com/account/my-api) |
| Turquie | [Sous-comptes TR](https://tr.okx.com/account/sub-account) | [Transferts TR](https://tr.okx.com/balance/transfer) | [Clés API TR](https://tr.okx.com/account/my-api) |
| Ailleurs | [Sous-comptes OKX](https://www.okx.com/account/sub-account) | [Transferts OKX](https://www.okx.com/balance/transfer) | [Clés API OKX](https://www.okx.com/account/my-api) |

Les fonctions disponibles peuvent varier selon la juridiction et le profil du
compte. Si une page n'existe pas après connexion, ne changez pas de région au
hasard : vérifiez le domaine habituel du compte et consultez l'aide OKX locale.
