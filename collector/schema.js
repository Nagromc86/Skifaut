// Schéma commun Skifaut — sortie normalisée du collecteur.
// Toutes les sources (SkiRadar, OSM, flux de station…) sont ramenées à cette forme.

/**
 * @typedef {Object} Domain
 * @property {string} id         identifiant stable (slug)
 * @property {string} name       nom de la station
 * @property {string} massif     massif (Alpes du Nord, Pyrénées, Vosges…)
 * @property {string} area       domaine relié (Les 3 Vallées, Paradiski…)
 * @property {string} [commune]  commune principale
 * @property {number} lat        latitude (centre station)
 * @property {number} lon        longitude
 * @property {number} altMin     altitude mini (m)
 * @property {number} altMax     altitude maxi (m)
 * @property {string[]} sources  sources ayant alimenté cette fiche
 * @property {Status|null} status   état d'ouverture temps réel (null si inconnu)
 * @property {Snow|null} snow       enneigement (null si inconnu)
 * @property {string} [website]
 * @property {string} [pistemap]
 * @property {Graph|null} graph  graphe routable (noeuds/arêtes) — null tant que non produit
 */

/**
 * @typedef {Object} Status
 * @property {number|null} liftsOpen
 * @property {number|null} liftsTotal
 * @property {number|null} pistesOpen
 * @property {number|null} pistesTotal
 * @property {string|null} updatedAt  ISO 8601
 */

/**
 * @typedef {Object} Snow
 * @property {number|null} top     cm au sommet
 * @property {number|null} bottom  cm en bas
 * @property {string|null} updatedAt
 */

function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Fabrique une fiche domaine valide à partir de champs partiels, en
// garantissant la présence des clés du schéma (valeurs nulles sinon).
function makeDomain(p) {
  return {
    id: p.id || slug(p.name),
    name: p.name,
    massif: p.massif || null,
    area: p.area || null,
    commune: p.commune || null,
    lat: num(p.lat),
    lon: num(p.lon),
    altMin: num(p.altMin),
    altMax: num(p.altMax),
    sources: p.sources || [],
    status: p.status || null,
    snow: p.snow || null,
    website: p.website || null,
    pistemap: p.pistemap || null,
    graph: p.graph || null,
  };
}

function num(v) { return v == null || v === '' ? null : Number(v); }

// Fusionne deux fiches du même domaine : les champs non-nuls de `b`
// l'emportent, les sources se cumulent. Sert à superposer les sources.
function mergeDomain(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b)) {
    if (k === 'sources') { out.sources = [...new Set([...(a.sources||[]), ...(b.sources||[])])]; continue; }
    if (b[k] != null) out[k] = b[k];
  }
  return out;
}

module.exports = { slug, makeDomain, mergeDomain, num };
