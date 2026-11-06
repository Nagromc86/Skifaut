// Adaptateur SkiRadar — feed JSON public des stations de ski françaises.
// Endpoint : GET https://api.skiradar.fr/api/v1/geo-feed?niche=montagne
//   - public, gratuit, sans compte ; paginé (page, limit<=500) ; filtrable ?massif=
//   - 30 req/min/IP ; Cache-Control 5 min (ETag / Last-Modified gérés)
//   - données factuelles réutilisables avec attribution "skiradar.fr"
//   - sources sous-jacentes : OpenStreetMap (ODbL), Wikidata (CC0),
//     Météo-France, DATAtourisme
//
// Remarque : le nommage exact des champs du feed peut évoluer ; le mapping
// ci-dessous lit plusieurs clés probables (pick) et reste tolérant.

const { makeDomain } = require('../schema');

const BASE = 'https://api.skiradar.fr/api/v1/geo-feed';

function pick(obj, ...keys) {
  for (const k of keys) {
    const v = k.split('.').reduce((o, p) => (o == null ? o : o[p]), obj);
    if (v != null) return v;
  }
  return null;
}

// Un enregistrement SkiRadar -> fiche au schéma commun.
function normalize(r) {
  const coords = pick(r, 'coordinates', 'geo', 'location') || {};
  const lat = pick(r, 'lat', 'latitude') ?? coords.lat ?? coords.latitude;
  const lon = pick(r, 'lon', 'lng', 'longitude') ?? coords.lon ?? coords.lng ?? coords.longitude;
  const open = pick(r, 'opening', 'status') || {};
  const snow = pick(r, 'snow', 'enneigement') || {};
  return makeDomain({
    name: pick(r, 'name', 'label', 'title'),
    massif: pick(r, 'massif', 'range', 'mountainRange'),
    area: pick(r, 'area', 'skiArea', 'domaine'),
    commune: pick(r, 'commune', 'city', 'town'),
    lat, lon,
    altMin: pick(r, 'altMin', 'altitudeMin', 'altitude.min'),
    altMax: pick(r, 'altMax', 'altitudeMax', 'altitude.max'),
    website: pick(r, 'website', 'url', 'officialWebsite'),
    pistemap: pick(r, 'pistemap', 'trailMap', 'map'),
    status: {
      liftsOpen: pick(open, 'liftsOpen', 'lifts.open'),
      liftsTotal: pick(open, 'liftsTotal', 'lifts.total'),
      pistesOpen: pick(open, 'pistesOpen', 'slopes.open', 'pistes.open'),
      pistesTotal: pick(open, 'pistesTotal', 'slopes.total', 'pistes.total'),
      updatedAt: pick(open, 'updatedAt', 'timestamp', 'date'),
    },
    snow: {
      top: pick(snow, 'top', 'summit', 'haut'),
      bottom: pick(snow, 'bottom', 'base', 'bas'),
      updatedAt: pick(snow, 'updatedAt', 'date'),
    },
    sources: ['SkiRadar.fr', 'OpenStreetMap', 'Wikidata', 'Météo-France'],
  });
}

// Récupère toutes les stations (paginées). `fetch` global (Node >= 18).
async function fetchAll({ massif, limit = 500, max = Infinity } = {}) {
  const out = [];
  for (let page = 1; out.length < max; page++) {
    const url = new URL(BASE);
    url.searchParams.set('niche', 'montagne');
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));
    if (massif) url.searchParams.set('massif', massif);
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`SkiRadar HTTP ${res.status}`);
    const body = await res.json();
    const items = Array.isArray(body) ? body : (body.items || body.data || body.resorts || []);
    if (!items.length) break;
    for (const it of items) out.push(normalize(it));
    if (items.length < limit) break;
  }
  return out;
}

module.exports = { fetchAll, normalize };
