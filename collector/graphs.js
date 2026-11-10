#!/usr/bin/env node
// Construit, pour chaque domaine de www/data/domains.json, un graphe routable
// à partir d'OpenStreetMap (Overpass) : pistes (piste:type=downhill) et remontées (aerialway).
// Sortie : www/data/graphs/<id>.json (polylignes simplifiées + nœuds partagés) et www/data/graphs/index.json.
// Données © les contributeurs OpenStreetMap (ODbL).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'www', 'data', 'graphs');
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const LIFT = 'gondola|cable_car|chair_lift|mixed_lift|drag_lift|t-bar|j-bar|platter|magic_carpet|rope_tow|funicular';
const DIFF = { novice: 'vert', easy: 'bleu', intermediate: 'rouge', advanced: 'noir', expert: 'noir', freeride: 'noir' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function bboxOf(d, r) {
  const dl = r, dn = r / Math.cos(d.lat * Math.PI / 180);
  return [d.lat - dl, d.lon - dn, d.lat + dl, d.lon + dn].map(x => +x.toFixed(5));
}
const query = b => `[out:json][timeout:180];(way["piste:type"="downhill"](${b.join(',')});way["aerialway"~"^(${LIFT})$"](${b.join(',')}););out body geom;`;

async function overpass(b) {
  let err;
  for (let round = 0; round < 3; round++) {
    for (const ep of ENDPOINTS) {
      try {
        const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Skiffo-collector (github.com/Nagromc86/Skifaut)' }, body: 'data=' + encodeURIComponent(query(b)), signal: AbortSignal.timeout(240000) });
        if (res.ok) return res.json();
        err = new Error(`${ep} HTTP ${res.status}`);
      } catch (e) { err = e; }
      await sleep(4000);
    }
    await sleep(15000);
  }
  throw err;
}

const R = 6371000, rad = Math.PI / 180;
function dist(a, b) { const dl = (b[0] - a[0]) * rad, dn = (b[1] - a[1]) * rad, x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function simplify(pts, tol) { // Douglas-Peucker (mètres, approximation plane)
  if (pts.length < 3) return pts;
  const k = Math.cos(pts[0][0] * rad), xy = pts.map(p => [p[1] * 111320 * k, p[0] * 111320]);
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(); let m = -1, id = -1;
    const [ax, ay] = xy[i], [bx, by] = xy[j], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    for (let n = i + 1; n < j; n++) {
      let t = L ? ((xy[n][0] - ax) * dx + (xy[n][1] - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
      const e = Math.hypot(xy[n][0] - (ax + t * dx), xy[n][1] - (ay + t * dy));
      if (e > m) { m = e; id = n; }
    }
    if (m > tol) { keep[id] = 1; st.push([i, id], [id, j]); }
  }
  return pts.filter((_, n) => keep[n]);
}
const r5 = x => Math.round(x * 1e5) / 1e5;

function build(elements) {
  const ways = elements.filter(e => e.type === 'way' && e.geometry && e.nodes && e.geometry.length === e.nodes.length && e.nodes.length > 1);
  const uses = new Map(); // id nœud -> nombre de voies qui le portent (jonctions)
  for (const w of ways) for (const id of w.nodes) uses.set(id, (uses.get(id) || 0) + 1);
  const nodes = {}, edges = [];
  for (const w of ways) {
    const t = w.tags || {}, isLift = !!t.aerialway && !t['piste:type'];
    const base = isLift ? { k: 'l', t: t.aerialway } : { k: 'p', d: DIFF[t['piste:difficulty']] || (t['piste:difficulty'] ? 'bleu' : null) };
    if (!isLift && t.area === 'yes') continue;
    if (t.access === 'private' || t.disused || t['abandoned:aerialway']) continue;
    const nm = t.name || t.ref || null;
    // coupe la voie aux jonctions
    let start = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      if (i === w.nodes.length - 1 || uses.get(w.nodes[i]) > 1) {
        const seg = w.geometry.slice(start, i + 1).map(g => [g.lat, g.lon]);
        const a = w.nodes[start], z = w.nodes[i];
        if (a !== z) {
          let len = 0; for (let n = 1; n < seg.length; n++) len += dist(seg[n - 1], seg[n]);
          const pts = simplify(seg, 4);
          nodes[a] = [r5(seg[0][0]), r5(seg[0][1])]; nodes[z] = [r5(seg[seg.length - 1][0]), r5(seg[seg.length - 1][1])];
          edges.push(Object.assign({ id: w.id + '.' + start, a, z, n: nm, len: Math.round(len), g: pts.map(p => [r5(p[0]), r5(p[1])]) }, base,
            isLift ? { cap: t['aerialway:capacity'] ? +t['aerialway:capacity'] : undefined, oneway: undefined } : { gr: t['piste:grooming'] || undefined, up: t['piste:oneway'] === 'no' ? 1 : undefined }));
        }
        start = i;
      }
    }
  }
  return { nodes, edges };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const dom = JSON.parse(fs.readFileSync(path.join(ROOT, 'www', 'data', 'domains.json'), 'utf8'));
  const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
  const radius = +((process.argv.find(a => a.startsWith('--radius=')) || '').slice(9)) || 0.07;
  const index = {};
  for (const d of dom.domains) {
    if (only.length && only.indexOf(d.id) < 0) continue;
    const b = bboxOf(d, radius);
    try {
      const raw = await overpass(b);
      const g = build(raw.elements || []);
      const pistes = g.edges.filter(e => e.k === 'p'), lifts = g.edges.filter(e => e.k === 'l');
      const km = Math.round(pistes.reduce((s, e) => s + e.len, 0) / 100) / 10;
      const out = { id: d.id, name: d.name, generatedAt: new Date().toISOString(), bbox: b, attribution: '© contributeurs OpenStreetMap (ODbL)', stats: { edges: g.edges.length, pistes: pistes.length, lifts: lifts.length, pisteKm: km }, nodes: g.nodes, edges: g.edges };
      const s = JSON.stringify(out);
      fs.writeFileSync(path.join(OUT, d.id + '.json'), s);
      index[d.id] = { bytes: s.length, at: out.generatedAt, bbox: b, stats: out.stats };
      console.log(`${d.id}: ${pistes.length} pistes (${km} km), ${lifts.length} remontées, ${(s.length / 1024).toFixed(0)} Ko`);
    } catch (e) { console.log(`${d.id}: ÉCHEC ${e.message}`); }
    await sleep(8000);
  }
  const f = path.join(OUT, 'index.json');
  let old = {}; try { old = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
  fs.writeFileSync(f, JSON.stringify(Object.assign(old, index), null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
