# Skifaut

**Tout ce qu'il faut quand il faut.**

Prototype d'application de ski pour se repérer sur le domaine, calculer l'itinéraire optimal d'un point A à un point B (quelle piste descendre, quelle remontée prendre), suivre ses parcours et ceux de ses amis, et retrouver tous les horaires de la station.

> ⚠️ **Prototype.** Les données affichées (domaine « Val Frisson », remontées, pistes, restaurants, parcours des amis) sont simulées pour illustrer l'expérience. Rien n'est encore connecté à de vraies sources de station ni au GPS.

## Fonctionnalités de la maquette

- **Carte** — repérage sur le domaine et planificateur d'itinéraire A→B
  - critères d'optimisation (le plus rapide, le moins de remontées, le plus facile…)
  - niveau de skieur (débutant / intermédiaire / expert)
  - filtre *ski uniquement / avec navette*
  - « maison » (hébergement) et bouton **Retour maison**
  - **alertes de fermeture** : prévient quand une remontée de l'itinéraire ferme bientôt, selon l'heure d'arrivée estimée
- **Parcours** — tracés des journées de ski, avec ceux des amis en surimpression (s'ils les partagent)
- **Amis** — partage de position
- **Horaires** — remontées, pistes, navettes, restaurants, activités, avec recherche et bouton « Y aller »
- **Domaines** — couvre tous les domaines français, ne télécharge que celui où l'on se trouve (repéré par GPS), utilisable hors-ligne
- **Manger** — restaurants en station, recherche et favoris

## Pile technique

- Interface : une page web autonome (HTML/CSS/JS, sans dépendance), dans `www/`
- Emballage natif : [Capacitor](https://capacitorjs.com/) (`android/`)
- Build : GitHub Actions génère l'APK à chaque push sur `main`

## Récupérer l'APK

À chaque build, l'APK est publié :
- dans la **release `latest`** (le plus simple à télécharger depuis un téléphone) ;
- en **artefact** du workflow *Build Skifaut APK* (onglet Actions).

C'est un build *debug* : sur le téléphone, autoriser l'installation depuis des sources inconnues.

## Développer en local

```bash
npm install
# modifier www/index.html
npx cap sync android
cd android && ./gradlew assembleDebug
```
