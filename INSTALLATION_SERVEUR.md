# Brancher les comptes au serveur Paulogames F1

Le dépôt contient un site statique GitHub Pages et un serveur multijoueur Node.js. Les comptes nécessitent la base PostgreSQL ; enregistrer un fichier JSON ou SQLite dans le système de fichiers d'un service web gratuit Render ne garantit pas la persistance après un redémarrage. Render indique que les systèmes de fichiers des services gratuits sont éphémères et recommande une base PostgreSQL gérée pour les données relationnelles ([documentation officielle](https://render.com/docs/free)).

## 1. Créer une base PostgreSQL

Le serveur accepte toute base PostgreSQL accessible par une URL de connexion `DATABASE_URL`. Par exemple, Neon propose actuellement un plan gratuit PostgreSQL avec 1 Go de stockage par projet ([annonce officielle Neon du 2 octobre 2026](https://neon.com/blog/neon-free-plan-1-gb-per-project)).

1. Crée un projet PostgreSQL chez le fournisseur choisi.
2. Copie sa chaîne de connexion PostgreSQL. Elle contient des identifiants confidentiels : ne la publie pas dans GitHub et ne la colle pas dans le code du site.
3. Garde-la pour l'étape suivante. Le serveur crée automatiquement les tables requises au premier accès à l'API.

## 2. Configurer Render

Dans le tableau de bord Render, ouvre le service `paulogames-server`, puis **Environment**. Ajoute les variables suivantes :

- `DATABASE_URL` = chaîne de connexion PostgreSQL copiée à l'étape 1.
- `ADMIN_USERNAME` = `admin`.
- `ADMIN_PASSWORD` = un mot de passe administrateur long, unique et que tu gardes secret.
- `CORS_ORIGINS` = `https://paueym-lgtm.github.io` (si ton GitHub Pages utilise un autre domaine, mets exactement son origine ; ne mets pas le chemin `/Formule-1`).

Ne mets jamais `ADMIN_PASSWORD` ou `DATABASE_URL` dans `index.html`, `paddock.js` ou un fichier versionné. Les variables doivent rester côté serveur.

Dans les paramètres du service, vérifie également :

- **Root Directory** : `game-server`
- **Build Command** : `npm install`
- **Start Command** : `npm start`
- Version Node.js : 20 ou plus récente.

Remplace les deux fichiers du serveur par `game-server/server.js` et `game-server/package.json` dans l'archive. Le prochain déploiement installe `pg` et démarre l'API en même temps que le WebSocket multijoueur.

## 3. Mettre à jour la page du jeu

À la racine du dépôt qui publie GitHub Pages, remplace `index.html`, `paddock.css`, `paddock.js`, `tracks-data.js`, `audio.mp3` et `community-license.txt` par les fichiers correspondants de l'archive. **Ne supprime pas ton dossier `assets/` existant**, en particulier `assets/paddock.png`.

La page appelle par défaut `https://paulogames-server.onrender.com`. Si tu changes l'adresse publique du service Render, modifie la constante `CAREER_API_BASE` dans `index.html` pour qu'elle corresponde au domaine HTTPS de l'API.

## 4. Vérifier que tout est branché

Ouvre cette URL après le déploiement :

`https://paulogames-server.onrender.com/api/health`

Le JSON doit contenir `"databaseReady":true`. S'il indique `false`, lis `databaseMessage` : vérifie `DATABASE_URL` dans Render et les journaux du service.

Dans le jeu :

1. Ouvre **Compte**, crée un compte avec un identifiant de 3 à 20 caractères et un mot de passe d'au moins 8 caractères.
2. Déconnecte-toi, puis reconnecte-toi avec les mêmes identifiants depuis un autre appareil : le profil, le solde et les achats doivent revenir depuis la base.
3. Pour tester les achats, crédite le portefeuille du compte avec les récompenses de podium ou par l'administration.
4. Pour l'administration, tape `admin` dans le champ du nom de pilote et ouvre le panneau. Choisis **Ouvrir la connexion admin**, puis connecte-toi dans **Compte** avec l'identifiant `admin` et le mot de passe `ADMIN_PASSWORD` configuré côté Render. Après authentification, la liste des comptes serveur et l'édition du solde sont disponibles.

## Notes de sécurité et limites connues

- Le front-end conserve uniquement un jeton de session dans le navigateur ; les comptes et leurs données de carrière sont dans PostgreSQL.
- Les prix, prérequis d'amélioration et débits sont vérifiés côté serveur. Un achat de logo déjà possédé peut être rééquipé gratuitement.
- Les mots de passe des pilotes sont hachés par `scrypt` avec un sel unique ; ne réutilise pas de vrais mots de passe personnels dans le jeu.
- Les gains sont de la monnaie virtuelle. Le classement étant calculé par le client actuel, un système anti-triche complet demanderait que le serveur valide lui-même les résultats de course.
