// Rassemble les résumés des robots, les garde dans data/resumes.json et les ajoute aux actualités (data/news-auto.json)
import fs from 'fs';
import crypto from 'crypto';
const keyOf = x => crypto.createHash('sha1').update((x.title || '') + '|' + (x.link || '')).digest('hex').slice(0, 12);
let cache = {}; try { cache = JSON.parse(fs.readFileSync('data/resumes.json', 'utf8')); } catch {}
let added = 0;
for (const f of fs.existsSync('parts') ? fs.readdirSync('parts', { recursive: true }) : []) {
  if (!String(f).endsWith('.json')) continue;
  const o = JSON.parse(fs.readFileSync('parts/' + f, 'utf8')); for (const [id, r] of Object.entries(o)) { if (!r.r && cache[id] && cache[id].r && cache[id].k === r.k) continue; cache[id] = r; if (r.r) added++; }
}
const d = JSON.parse(fs.readFileSync('data/news-auto.json', 'utf8')); const live = new Set(d.items.map(x => x.id)); let applied = 0;
for (const x of d.items) { const r = cache[x.id]; if (r && r.r && r.k === keyOf(x)) { x.resume = r.r; x.titreFr = r.titre; applied++; } else { delete x.resume; delete x.titreFr; } }
// on oublie les résumés des annonces disparues depuis plus de 30 jours
for (const [id, r] of Object.entries(cache)) if (!live.has(id) && Date.now() - (r.ts || 0) > 30 * 864e5) delete cache[id];
fs.writeFileSync('data/resumes.json', JSON.stringify(cache));
fs.writeFileSync('data/news-auto.json', JSON.stringify(d, null, 1));
console.log(`${added} nouveaux résumés, ${applied}/${d.items.length} actualités résumées`);
