# Connexion du jeu F1 à Supabase

Le serveur utilise désormais Supabase Auth pour les comptes et la table `public.profiles` pour le profil, les crédits, les améliorations et les logos. Les récompenses sont enregistrées dans `public.player_race_rewards`.

## 1. Appliquer la migration SQL (une seule fois)

1. Ouvre le projet Supabase **Jeu F1**.
2. Va dans **SQL Editor**.
3. Ouvre le fichier `game-server/supabase-migration.sql` dans GitHub et copie tout son contenu.
4. Colle-le dans une nouvelle requête SQL puis clique **Run**.

Cette migration complète la table `profiles` existante et crée la table des récompenses. Elle ne recrée pas `profiles` ni `player_cars`.

## 2. Ajouter les variables Render

Dans le service Render qui héberge `game-server`, ouvre **Environment** et ajoute :

- `SUPABASE_URL` : l’URL du projet Supabase.
- `SUPABASE_ANON_KEY` : la clé publique/anon du projet Supabase.
- `DATABASE_URL` : la chaîne de connexion PostgreSQL du même projet Supabase.
- `ADMIN_PASSWORD` : le mot de passe privé de l’administrateur du jeu.
- `ADMIN_USERNAME` : facultatif ; sinon le pseudo admin par défaut est `admin`.

Récupère les valeurs dans le tableau de bord Supabase (Project URL, API Keys et connexion PostgreSQL). Ne publie jamais le mot de passe PostgreSQL ni `ADMIN_PASSWORD`. N’ajoute pas la clé `service_role` au code public ou à GitHub.

Pour `DATABASE_URL`, utilise la chaîne de connexion PostgreSQL fournie par Supabase, avec le mot de passe de base de données de ton projet. Si le serveur ne peut pas joindre l’adresse directe, essaie la chaîne **Session pooler** fournie dans la fenêtre Connect de Supabase.

## 3. Réglage Auth requis pour l’interface actuelle

L’écran de création de compte du jeu demande un pseudo et un mot de passe, pas une adresse e-mail. Le serveur convertit donc le pseudo en adresse technique `pseudo@accounts.paulogames.invalid`. Dans Supabase **Authentication**, désactive la confirmation d’e-mail pour ce mode de compte à pseudo ; sinon Supabase ne renverra pas de session immédiate et l’inscription restera incomplète.

## 4. Vérifier

Après avoir enregistré les variables, redémarre/déploie le service Render puis ouvre :

`https://paulogames-server.onrender.com/api/health`

Le résultat doit afficher `"databaseReady": true` et `"supabaseAuthConfigured": true`. Si `databaseReady` est faux, lis `databaseMessage` : la migration SQL doit avoir été exécutée avant de tester les achats et les récompenses.
