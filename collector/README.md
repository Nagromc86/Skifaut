# Collecteur Skifaut (ETL)

Agrège « en amont » les données des stations de ski françaises depuis plusieurs
sources hétérogènes et produit un fichier **normalisé** que l'application
consomme : [`../www/data/domains.json`](../www/data/domains.json).

C'est l'ETL décrit dans le cahier des charges : chaque station publie son
information à sa façon (page web, open-data, flux du domaine). Le collecteur
récupère chaque source, la ramène à un **schéma commun** ([`schema.js`](schema.js))
et superpose les sources (le réel écrase le seed, les sources se cumulent).

## Sources

| Source | Rôle | Licence |
|---|---|---|
| **SkiRadar** (`api.skiradar.fr/api/v1/geo-feed`) | identité, position, altitudes, pistes par difficulté, remontées, **ouvertures temps réel**, enneigement Météo-France | réutilisation avec attribution `skiradar.fr` |
| **OpenStreetMap / Overpass** | géométrie des pistes (`piste:type`) et remontées (`aerialway`) → **graphe routable** | ODbL (attribution + partage) |
| **Wikidata** | identifiants stables, rattachements | CC0 |
| **Météo-France** | enneigement (via SkiRadar) | — |
| **Seed curé** ([`seed/domains.seed.json`](seed/domains.seed.json)) | base hors-ligne vérifiée (identité + position de 23 stations) | — |

> Les ouvertures de pistes/remontées ne sont pas standardisées d'une station à
> l'autre : le collecteur est fait pour brancher de nouveaux adaptateurs par
> station (un fichier par source dans [`sources/`](sources/)) sans toucher au reste.

## Lancer

```bash
# Base hors-ligne (seed curé) — ne nécessite aucun réseau
node collector/index.js

# Enrichir avec les ouvertures / enneigement temps réel (réseau requis)
node collector/index.js --live
node collector/index.js --live --massif=alpes-du-nord

# Construire le graphe routable d'un domaine depuis OSM (réseau requis)
node collector/index.js --graph="val-thorens" --bbox=45.28,6.56,45.33,6.62
```

La sortie est écrite dans `www/data/domains.json` ; l'application la charge au
démarrage (repli sur la liste embarquée si le fichier est absent).

## Où ça tourne

Le collecteur a besoin d'un accès internet vers ces API. On peut le lancer :
- en local avant un build,
- sur un petit serveur/cron qui rafraîchit `domains.json` plusieurs fois par jour,
- dans une GitHub Action planifiée (à ajouter) qui committe le JSON à jour.

## Schéma de sortie

Voir [`schema.js`](schema.js). Un domaine :

```jsonc
{
  "id": "val-thorens",
  "name": "Val Thorens",
  "massif": "Alpes du Nord",
  "area": "Les 3 Vallées",
  "commune": "Les Belleville",
  "lat": 45.2976, "lon": 6.5806,
  "altMin": 2300, "altMax": 3230,
  "sources": ["Skifaut (curé)", "SkiRadar.fr", "OpenStreetMap"],
  "status": { "liftsOpen": null, "liftsTotal": null, "pistesOpen": null, "pistesTotal": null, "updatedAt": null },
  "snow":   { "top": null, "bottom": null, "updatedAt": null },
  "graph":  null
}
```

`status`, `snow` et `graph` sont `null` tant que la source live / OSM n'a pas été
exécutée : ils ne sont jamais inventés.
