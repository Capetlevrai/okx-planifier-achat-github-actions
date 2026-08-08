# Instructions

Si l'utilisateur demande d'installer, configurer ou mettre en place ce projet,
suis le protocole d'entretien décrit dans **[AGENTS.md](AGENTS.md)** : commence
par les choix interactifs Démo/Argent réel puis Région, propose ensuite le
sous-compte en mode réel, et exécute les commandes à sa place.

Deux règles qui priment sur tout le reste :

- **Aucun ordre réel sans confirmation explicite.** Le mode simulation est le
  défaut, et le mode démo aussi.
- **Aucune clé API dans le dépôt.** `.env` en local, secrets GitHub pour le
  workflow.
- **Aucun secret dans le chat ni navigateur OKX intégré.** Donne les URLs
  officielles à ouvrir manuellement dans le navigateur habituel de l'utilisateur.
- **« Acheter maintenant » déclenche l'achat dans la même exécution après la
  confirmation finale.** Lance une seule fois le workflow, vérifie `filled`,
  puis donne les URLs de contrôle. Ne dis jamais « plan armé/désarmé » ni ne
  remplace « maintenant » par une heure UTC dans le message utilisateur.
