/* Luisart · robot de veille des formations en art.
   Cherche des cours et formations (histoire de l'art, techniques, pratique, philosophie de l'art)
   sur des catalogues publics et des flux RSS, puis écrit data/formations-auto.json.
   Respect des droits : seulement le titre, un court résumé, la source et le lien. Aucun contenu n'est copié. */
import fs from 'node:fs/promises';
const OUT = 'data/formations-auto.json', TIMEOUT = 20000, MAX = 90;
const UA = { 'user-agent': 'Mozilla/5.0 (LuisartVeille; +https://amourdvine-alt.github.io/luisart/)' };
const gn = (q, lang = 'fr', gl = 'CI') => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${lang}&gl=${gl}&ceid=${gl}:${lang}`;

async function get(url, json) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), TIMEOUT);
  try { const r = await fetch(url, { signal: c.signal, headers: { ...UA, accept: json ? 'application/json' : 'application/rss+xml, application/atom+xml, text/xml, */*' } });
    if (!r.ok) throw new Error('HTTP ' + r.status); return json ? await r.json() : await r.text(); } finally { clearTimeout(t); }
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ecirc: 'ê', hellip: '…', ndash: '–', mdash: '—' };
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const strip = s => decode(decode(s)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, n) => { const m = x.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`, 'i')); return m ? m[1] : ''; };
const attr = (x, n, a) => { const m = x.match(new RegExp(`<${n}\\b[^>]*\\b${a}=["']([^"']+)["']`, 'i')); return m ? decode(m[1]) : ''; };
const feed = xml => (xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []).map(b => ({
  t: strip(tag(b, 'title')), url: (strip(tag(b, 'link')) || attr(b, 'link', 'href')).trim(), d: strip(tag(b, 'description') || tag(b, 'summary')), ts: Date.parse(strip(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated'))) || 0 }));

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ART = /(^|[^a-z])(art|arts|artiste|artist|peinture|painting|dessin|drawing|sculpture|aquarelle|watercolor|acrylique|huile|oil paint|gravure|printmaking|ceramique|ceramics|photograph|photo|illustration|design graphique|graphic design|esthetique|aesthetics|museum|musee|couleur|color theory|portrait|croquis|sketch|calligraph|batik|tissage|bronze|modelage|curat|commissariat)/;
const COURS = /(cours|course|formation|mooc|masterclass|atelier|workshop|tutoriel|tutorial|apprendre|learn|initiation|stage|classe|lesson|lecon|certificat|diplome|ecole)/;
const JUNK = /(martial|state of the art|art of war|intelligence artificielle|artificial intelligence|machine learning|crypto|football|cuisine|recette|marketing|blockchain|nft trading)/;
const cat = x => { const s = norm(x.t + ' ' + x.d);
  if (/abidjan|cote d'ivoire|ivoirien|bingerville|bassam/.test(s)) return 'En Côte d’Ivoire';
  if (/histoire de l'art|art history|renaissance|moderne|modern art|contemporain|contemporary|museum|musee|antiquite|ancient|african art|art africain/.test(s)) return 'Histoire de l’art';
  if (/philosoph|esthetique|aesthetic|theorie|theory|critique|semiolog/.test(s)) return 'Philosophie et théorie';
  if (/photo/.test(s)) return 'Photographie';
  if (/peinture|painting|dessin|drawing|aquarelle|watercolor|acrylique|huile|sculpt|gravure|ceramiq|croquis|sketch|portrait|couleur|color|illustration|modelage/.test(s)) return 'Techniques et pratique';
  return 'Autres formations'; };
const court = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };

const items = []; const bilan = [];
const add = (src, lang, l, opt = {}) => { let n = 0; for (const x of l) { if (!x || !x.t || !/^https:\/\//.test(x.url || '')) continue; const s = norm(x.t + ' ' + (x.d || ''));
    if (!ART.test(s) || JUNK.test(s) || (opt.cours && !COURS.test(s))) continue;
    items.push({ t: court(x.t, 110), d: court(x.d, 190), src: x.src || src, url: x.url, lang, free: !!(opt.free || x.free), ts: x.ts || 0 }); n++; } bilan.push(`${src} : ${n}`); };
const essai = async (nom, f) => { try { await f(); } catch (e) { bilan.push(`${nom} : indisponible (${String(e.message || e).slice(0, 60)})`); } };

// Coursera (catalogue public)
for (const [q, lang] of [['art history', 'en'], ['painting drawing', 'en'], ['african art', 'en'], ['aesthetics philosophy of art', 'en'], ['photography', 'en'], ["histoire de l'art", 'fr'], ['dessin peinture', 'fr']])
  await essai('Coursera « ' + q + ' »', async () => { const j = await get(`https://api.coursera.org/api/courses.v1?q=search&query=${encodeURIComponent(q)}&limit=12&fields=name,slug,description,primaryLanguages`, 1);
    add('Coursera', lang, (j.elements || []).map(c => ({ t: c.name, d: c.description, url: 'https://www.coursera.org/learn/' + c.slug, lang: (c.primaryLanguages || [])[0] })).map(c => ({ ...c })), {}); });
// FUN MOOC (France Université Numérique)
for (const q of ['art', 'histoire de l\'art', 'dessin', 'photographie'])
  await essai('FUN MOOC « ' + q + ' »', async () => { const j = await get(`https://www.fun-mooc.fr/api/v1.0/courses/?query=${encodeURIComponent(q)}&limit=15`, 1);
    add('FUN MOOC', 'fr', (j.objects || []).map(c => ({ t: typeof c.title === 'string' ? c.title : (c.title && (c.title.fr || c.title.en)) || '', d: typeof c.introduction === 'string' ? c.introduction : '', url: /^https:/.test(c.absolute_url || '') ? c.absolute_url : 'https://www.fun-mooc.fr' + (c.absolute_url || '') })), { free: true }); });
// Flux spécialisés
for (const [src, url, lang, opt] of [
  ['Smarthistory', 'https://smarthistory.org/feed/', 'en', { free: true }],
  ['Open Culture', 'https://www.openculture.com/category/art/feed', 'en', { free: true, cours: true }],
  ['Google Actualités', gn('MOOC "histoire de l\'art"'), 'fr', { cours: true }],
  ['Google Actualités', gn('"formation en ligne" peinture OR dessin OR "arts plastiques"'), 'fr', { cours: true }],
  ['Google Actualités', gn('"cours en ligne" gratuit "histoire de l\'art" OR peinture OR dessin'), 'fr', { cours: true }],
  ['Google Actualités', gn('masterclass OR atelier peinture OR dessin OR photographie Abidjan'), 'fr', { cours: true }],
  ['Google Actualités', gn('formation artistes plasticiens Afrique atelier OR masterclass OR résidence'), 'fr', { cours: true }],
  ['Google News', gn('"free online course" art history OR painting OR drawing', 'en', 'US'), 'en', { cours: true }],
]) await essai(src, async () => add(src, lang, feed(await get(url)).slice(0, 25), opt));

// Dédoublonnage, classement, équilibre entre catégories
const vus = new Set(), uniq = [];
for (const x of items) { const k = norm(x.t).replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60); if (vus.has(k) || vus.has(x.url)) continue; vus.add(k); vus.add(x.url); uniq.push({ ...x, cat: cat(x) }); }
const ordre = ['En Côte d’Ivoire', 'Techniques et pratique', 'Histoire de l’art', 'Philosophie et théorie', 'Photographie', 'Autres formations'];
const parCat = Object.fromEntries(ordre.map(c => [c, uniq.filter(x => x.cat === c).sort((a, b) => (b.lang === 'fr') - (a.lang === 'fr') || b.ts - a.ts)]));
const final = []; for (let i = 0; final.length < MAX && ordre.some(c => parCat[c][i]); i++) for (const c of ordre) if (parCat[c][i] && final.length < MAX) final.push(parCat[c][i]);
final.sort((a, b) => ordre.indexOf(a.cat) - ordre.indexOf(b.cat));

console.log(bilan.join('\n')); console.log(`\n${final.length} formations retenues : ` + ordre.map(c => `${c} ${final.filter(x => x.cat === c).length}`).join(' · '));
let ancien = null; try { ancien = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch (e) {}
if (final.length < 8 && ancien && (ancien.items || []).length >= final.length) { console.log('::warning::Trop peu de résultats cette fois : la sélection précédente est conservée.'); process.exit(0); }
await fs.mkdir('data', { recursive: true });
await fs.writeFile(OUT, JSON.stringify({ updated: Date.now(), items: final.map(({ ts, ...x }) => x) }, null, 1));
