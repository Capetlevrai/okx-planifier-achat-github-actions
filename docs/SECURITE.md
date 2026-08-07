# Sécurité

## Règles non négociables

1. Ne mettez jamais une clé OKX dans le dépôt.
2. Utilisez uniquement GitHub Actions Secrets : `OKX_API_KEY`, `OKX_SECRET_KEY` ou `OKX_API_SECRET`, `OKX_PASSPHRASE`.
3. La permission OKX Retrait doit rester désactivée. Lecture + Trading suffisent.
4. Le mode démo est le défaut.
5. Le mode réel doit être activé volontairement et explicitement.
6. Un dépôt public peut afficher votre planning et votre historique : ne publiez pas des montants que vous souhaitez garder privés.

## Repo privé vs repo public

GitHub Actions fonctionne sur repo privé avec GitHub Free. Vous n’êtes pas obligé de rendre votre dépôt public pour automatiser les achats.

GitHub Pages gratuit est plus simple sur repo public. Si vous voulez garder vos achats privés, utilisez `RAPPORT.md` ou `tableau-de-bord.html` dans le dépôt privé, ou servez l’interface localement.

## Argent réel

Avant d’activer l’argent réel, vérifiez :

- compte OKX correct ;
- paires correctes ;
- devise de cotation approvisionnée ;
- montant total engagé ;
- `plan.live=true` seulement après confirmation ;
- `plan.demo=false` seulement pour compte réel ;
- `DRY_RUN` absent ou à `0` uniquement quand vous voulez transmettre des ordres.
