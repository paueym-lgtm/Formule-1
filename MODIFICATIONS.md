# Modifications – version graphismes réalistes

Fichiers modifiés : index.html, paddock.css, paddock.js, game-server/server.js
Inchangés : tracks-data.js, audio.mp3, community-license.txt, package.json, .env.example
(assets/paddock.png reste chez toi, à sa place habituelle.)

## Redéploiement
1. Remplace index.html, paddock.css, paddock.js sur GitHub Pages (même nom, même dossier).
2. Remplace game-server/server.js sur Render puis redéploie : sans cela les logos ne sont pas vus par les autres joueurs (le jeu continue de fonctionner).
3. Aucun changement Supabase, aucun service payant.

## Limites connues
- Le serveur ne vérifie pas qu'un joueur possède bien le logo qu'il affiche (cosmétique uniquement, valeurs limitées à pg/bolt/crown/apex/none).
- Halo masqué en vue cockpit (son montant central cache la piste).
- Pas de LOD par distance ; modes de qualité Auto/Haute/Moyenne/Basse (résolution, ombres, effets).
- Performances réelles non mesurables en environnement de test (rendu logiciel) : à vérifier sur ton appareil.
