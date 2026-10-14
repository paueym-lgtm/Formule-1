PAULOGAMES F1 — COMPTES SERVEUR, BOUTIQUE ET MULTIJOUEUR
========================================================

CONTENU
- index.html             jeu 3D, compte, boutique et administration connectés à l'API
- paddock.css            styles du paddock et du catalogue de circuits
- paddock.js             catalogue, préparation du circuit et transitions du paddock
- tracks-data.js         tracés et profils de relief
- audio.mp3              musique d'accueil
- community-license.txt  licences et attributions
- game-server/server.js  serveur WebSocket + API de comptes et de boutique
- game-server/package.json dépendances du serveur (ws + pg)
- INSTALLATION_SERVEUR.md étapes de déploiement
- game-server/.env.example variables à configurer (aucun secret n'est inclus)

COMPTES ET SAUVEGARDE
- Les comptes pilote ne sont plus stockés comme données de compte dans localStorage.
- Les mots de passe sont hachés avec scrypt et un sel unique côté serveur.
- PostgreSQL conserve les comptes, profils, soldes, améliorations, logos et achats.
- Une session peut être utilisée sur un autre appareil en se connectant avec le même identifiant et mot de passe.
- Les sessions expirent après 30 jours.
- Les achats sont validés et débités côté serveur dans une transaction ; le prix envoyé par le navigateur n'est jamais utilisé.
- Les gains de podium sont crédités une fois par identifiant de course et par compte.
- L'administrateur est vérifié côté serveur avec ADMIN_PASSWORD ; taper « admin » ne donne pas à lui seul de privilèges.

IMPORTANT
Cette mise à jour du code n'active pas magiquement une base de données sur Render. Pour que les comptes soient partagés entre appareils et survivent aux redémarrages, configure DATABASE_URL et ADMIN_PASSWORD dans les variables d'environnement du service Render, selon INSTALLATION_SERVEUR.md. Le service de comptes renvoie volontairement une erreur claire tant que la base n'est pas configurée : il ne bascule pas silencieusement vers des comptes locaux.

Le classement de course est encore calculé par le client du jeu : le serveur empêche qu'un même runId soit payé plusieurs fois pour le même compte, mais le résultat reçu du navigateur n'est pas encore un résultat de course anti-triche certifié côté serveur. L'argent reste une monnaie virtuelle, sans valeur réelle.

MISE À JOUR DU PROJET
1. Remplace la racine statique du dépôt par les fichiers de l'archive (index.html, paddock.css, paddock.js, tracks-data.js, audio.mp3, community-license.txt).
2. Conserve le dossier assets/ existant, notamment assets/paddock.png, s'il se trouve déjà dans ton dépôt.
3. Remplace game-server/server.js et game-server/package.json par les versions de cette archive.
4. Dans Render, vérifie que le serveur multijoueur utilise le dossier racine game-server, Build Command `npm install` et Start Command `npm start`.
5. Ajoute les variables d'environnement nécessaires comme décrit dans INSTALLATION_SERVEUR.md, puis laisse Render redéployer.

Le front-end est configuré pour appeler https://paulogames-server.onrender.com. Si l'URL du serveur change, remplace CAREER_API_BASE dans le bloc « PAULOGAMES F1 — compte, boutique et récompenses via API sécurisée » en haut du script carrière d'index.html.
