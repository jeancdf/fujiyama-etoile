# Fujiyama Étoile — site et espace restaurant

Site vitrine du restaurant japonais Fujiyama Étoile (57 bd Gouvion-Saint-Cyr, Paris 17e)
et espace admin où le restaurant modifie lui-même sa carte, ses prix, ses photos et ses infos pratiques.

- **Site public** : HTML, CSS et JavaScript sans framework. Tout le contenu modifiable est lu dans `data/site.json`.
- **Serveur** : Node (>= 20), **sans aucune dépendance npm**. Il sert le site, l'admin et une petite API.
- **Données** : de simples fichiers JSON, pas de base de données.

## Structure

```
index.html, menus.html   Pages publiques (contenu de secours en français, remplacé par site.json)
assets/                  CSS, JS et photos d'origine du site public
admin/                   Espace restaurant (/admin/)
server/server.js         Serveur HTTP + API
server/validate.js       Contrôle de tout ce que l'admin enregistre
server/password.js       Empreintes de mot de passe (scrypt)
data/site.json           Contenu de départ, copié dans DATA_DIR au premier lancement
Dockerfile, docker-compose.prod.yml, deploy.sh   Déploiement
```

Dans `DATA_DIR` (volume Docker `fujiyama_data` en production) :

```
site.json     version publiée, lue par le site
draft.json    brouillon de l'admin (absent quand tout est publié)
history/      30 dernières versions publiées, pour revenir en arrière
uploads/      photos envoyées depuis l'admin
```

## Fonctionnement de l'admin

Chaque modification est enregistrée dans un **brouillon**, invisible des clients.
« Aperçu » montre le site avec le brouillon, « Publier sur le site » le met en ligne
(l'ancienne version part dans `history/`), « Tout annuler » revient à la version en ligne.

Les photos sont réduites dans le navigateur (1600 px, WebP) avant l'envoi ;
le serveur vérifie le vrai type du fichier et n'accepte que JPG, PNG et WebP.

## Lancer en local

```bash
node server/hash-password.js "un mot de passe d'au moins 10 caractères"
```

Créer `var/.env.local` (ignoré par git) :

```
ADMIN_PASSWORD_HASH='<empreinte affichée ci-dessus>'
SESSION_SECRET='<64 caractères aléatoires>'
PORT=8766
```

```bash
node --env-file=var/.env.local server/server.js
```

Site : http://localhost:8766 · Admin : http://localhost:8766/admin/

## Déploiement (serveur OVH)

En ligne sur **https://fujiyama-proto.duckdns.org** (admin : `/admin/`).

Le site tourne dans un conteneur Docker sur le VPS. Le HTTPS est assuré par le Caddy partagé du serveur,
configuré dans le dépôt `qr-code` (`docker-compose.prod.yml`, bloc `caddyfile`) : le conteneur
`fujiyama-etoile` est sur le réseau `cv-proxy` et Caddy le joint par son nom. Le port 8095 n'écoute
que sur le serveur lui-même (vérifications).

**Automatique** : chaque push sur `main` lance `.github/workflows/deploy.yml`, qui vérifie le code
(syntaxe, validité de `data/site.json`, serveur démarré et interrogé), puis l'envoie sur le VPS et
reconstruit le conteneur. Si la vérification échoue, rien n'est déployé.

Secrets GitHub utilisés : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (clé dédiée à ce dépôt,
commentée `github-actions-fujiyama-etoile` dans `~/.ssh/authorized_keys` de `deploy` : supprimer
cette ligne la révoque) et `VPS_KNOWN_HOSTS` (empreinte du serveur).

**Manuel** (secours) : `./deploy.sh` fait la même chose depuis ton poste.

Les données du restaurant (volume `fujiyama_data`) ne sont jamais écrasées par un déploiement.

Les secrets de l'app sont dans `~/fujiyama-etoile/.env` sur le serveur (droits 600), valeurs entre apostrophes
car les empreintes contiennent des `$`. Pour changer le mot de passe admin : générer une nouvelle empreinte
avec `server/hash-password.js`, la remplacer dans ce fichier, puis redéployer.

**Vrai nom de domaine** : faire pointer son enregistrement A vers 51.210.109.16 et remplacer
`fujiyama-proto.duckdns.org` dans le Caddyfile du dépôt `qr-code`.

## Démo GitHub Pages

https://jeancdf.github.io/fujiyama-etoile/ affiche le site public avec `data/site.json` du dépôt
(l'admin ne peut pas y fonctionner : il faut le serveur Node). Les pages portent une balise `noindex`
à **retirer avant la mise en production** sur fujiyamaetoile.fr.

## À valider avec le client

- Lien de commande en ligne, Instagram et fiche Google : à renseigner dans l'admin (Infos pratiques).
- Mentions légales (obligatoires) et page allergènes.
- Le plan Google Maps intégré dépose des cookies tiers : prévoir un bandeau de consentement ou une image statique cliquable.
