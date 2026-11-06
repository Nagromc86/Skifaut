#!/usr/bin/env node
// Collecteur Skifaut — ETL « en amont ».
// Agrège les données des stations depuis plusieurs sources et écrit un fichier
// normalisé que l'application consomme : www/data/domains.json
//
// Usage :
//   node collector/index.js                 # base hors-ligne (seed curé)
//   node collector/index.js --live          # enrichit via SkiRadar (réseau requis)
//   node collector/index.js --live --massif=alpes-du-nord
//   node collector/index.js --graph=val-thorens --bbox=45.28,6.56,45.33,6.62
//
// Sources : SkiRadar.fr (feed public), OpenStreetMap/Overpass (ODbL),
// Wikidata (CC0), Météo-France. Attribution conservée dans la sortie.

const fs = require('fs');
const path = require('path');
const { makeDomain, mergeDomain, slug } = require('./schema');
const skiradar = require('./sources/skiradar');
const osm = require('./sources/osm');

const ARGS = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const OUT = path.join(__dirname, '..', 'www', 'data', 'domains.json');

async function main() {
  // 1) Base : seed curé (identité + position vérifiées), toujours disponible.
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed', 'domains.seed.json'), 'utf8'));
  const byId = new Map();
  for (const s of seed) {
    const d = makeDomain({ ...s, sources: ['Skifaut (curé)'] });
    byId.set(d.id, d);
  }

  // 2) Enrichissement live (ouvertures, enneigement, stations manquantes).
  if (ARGS.live) {
    try {
      console.log('→ SkiRadar : récupération du feed…');
      const live = await skiradar.fetchAll({ massif: ARGS.massif || undefined });
      for (const d of live) {
        const id = d.id || slug(d.name);
        byId.set(id, byId.has(id) ? mergeDomain(byId.get(id), d) : d);
      }
      console.log(`  ${live.length} stations reçues.`);
    } catch (e) {
      console.warn('  SkiRadar indisponible :', e.message, '— on garde le seed.');
    }
  }

  // 3) Graphe routable d'un domaine (optionnel) depuis OSM/Overpass.
  if (ARGS.graph && ARGS.bbox) {
    try {
      const bbox = String(ARGS.bbox).split(',').map(Number);
      console.log(`→ OSM/Overpass : graphe de ${ARGS.graph}…`);
      const raw = await osm.fetchRaw(bbox);
      const graph = osm.buildGraph(raw.elements || []);
      const id = slug(ARGS.graph);
      if (byId.has(id)) byId.get(id).graph = graph;
      console.log(`  ${Object.keys(graph.nodes).length} noeuds, ${graph.edges.length} arêtes.`);
    } catch (e) {
      console.warn('  Overpass indisponible :', e.message);
    }
  }

  const out = {
    generatedAt: new Date().toISOString(),
    version: 1,
    attribution: ['OpenStreetMap (ODbL)', 'Wikidata (CC0)', 'Météo-France', 'SkiRadar.fr', 'DATAtourisme'],
    domains: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`✔ ${out.domains.length} stations écrites → ${path.relative(path.join(__dirname, '..'), OUT)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
