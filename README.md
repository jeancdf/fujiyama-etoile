# Fujiyama Étoile — refonte du site

Site vitrine statique du restaurant japonais Fujiyama Étoile (57 bd Gouvion-Saint-Cyr, Paris 17e).
HTML, CSS et JavaScript sans framework ni étape de build : il s'héberge tel quel sur n'importe quel serveur (OVH, Netlify, GitHub Pages…).

## Structure

```
index.html            Accueil : hero, infos pratiques, sélection de menus, boissons, plan d'accès
menus.html            Carte complète (11 catégories, 115 articles), navigation collante
assets/css/styles.css Feuille de style unique (couleurs et polices en variables en tête de fichier)
assets/js/main.js     FR/EN, statut ouvert/fermé (heure de Paris), rendu des menus
assets/img/           Photos en WebP (reprises du site actuel), favicon, image de partage
data/menus.json       La carte : source de vérité
data/menus.js         Généré depuis menus.json (chargé par les pages)
tools/build_menus.py  Régénère menus.js
```

## Voir le site en local

```bash
python -m http.server 8765
```

Puis ouvrir http://127.0.0.1:8765

## Modifier la carte

1. Éditer `data/menus.json` (nom, prix au format `14,90`, description `fr`/`en`, photo, `pour2`).
2. Lancer `python tools/build_menus.py`.

Les horaires d'ouverture se changent dans `assets/js/main.js` (constantes `LUNCH`, `DINNER`, `SLOTS`)
ainsi que dans le tableau des horaires de `index.html` et le JSON-LD en tête de `index.html`.

## À valider avec le client

- Lien de commande en ligne (Uber Eats, Deliveroo…) : aujourd'hui « Commander » appelle le restaurant.
- Comptes Instagram / fiche Google à afficher dans le pied de page.
- Mentions légales (obligatoires) et page allergènes.
- Le plan Google Maps intégré dépose des cookies tiers : prévoir un bandeau de consentement ou une image statique cliquable.
- Les descriptions anglaises viennent du site actuel et ont été légèrement corrigées ; une relecture reste utile.
