// Adaptateur OpenStreetMap (Overpass) — géométrie des pistes et remontées.
// OSM est la source ouverte la plus complète pour bâtir le graphe routable
// d'un domaine : chaque piste porte piste:type / piste:difficulty / name,
// chaque remontée porte aerialway=* / name. Licence ODbL (attribution + partage).
//
// Le réseau sortant du conteneur de build peut être restreint : lancez cet
// adaptateur là où Overpass est joignable (machine locale, serveur, CI avec
// accès internet).

const OVERPASS = 'https://overpass-api.de/api/interpreter';

// bbox = [south, west, north, east]
function query(bbox) {
  const b = bbox.join(',');
  return `[out:json][timeout:60];
(
  way["piste:type"="downhill"](${b});
  way["aerialway"](${b});
);
out tags geom;`;
}

async function fetchRaw(bbox) {
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: query(bbox),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

const DIFF = { novice: 'vert', easy: 'bleu', intermediate: 'rouge', advanced: 'noir', expert: 'noir' };

// Construit un graphe routable à partir des éléments OSM.
// Étapes clés (snapping des extrémités en noeuds partagés, sens de descente
// déduit de l'altitude) — implémentation volontairement simple et documentée,
// à affiner par domaine.
function buildGraph(elements) {
  const nodes = {}; const edges = [];
  const key = (lat, lon) => `${lat.toFixed(4)},${lon.toFixed(4)}`; // ~11 m : snapping
  const addNode = (lat, lon) => { const k = key(lat, lon); if (!nodes[k]) nodes[k] = { id: k, lat, lon }; return k; };

  for (const el of elements) {
    if (!el.geometry || el.geometry.length < 2) continue;
    const g = el.geometry;
    const a = addNode(g[0].lat, g[0].lon);
    const z = addNode(g[g.length - 1].lat, g[g.length - 1].lon);
    const t = el.tags || {};
    if (t['piste:type'] === 'downhill') {
      edges.push({ a, z, kind: 'piste', name: t.name || null,
        difficulty: DIFF[t['piste:difficulty']] || 'bleu' });
    } else if (t.aerialway) {
      edges.push({ a, z, kind: 'lift', name: t.name || null, aerialway: t.aerialway });
    }
  }
  return { nodes, edges,
    note: 'Graphe brut OSM : sens de descente et connexions à valider par domaine (altitude, continuité des pistes).' };
}

module.exports = { query, fetchRaw, buildGraph, OVERPASS };
