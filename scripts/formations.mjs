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
  t: strip(tag(b, 'title')), url: (strip(tag(b, 'link')) || attr(b, 'link', 'href')).trim(), d: strip(tag(b, 'description') || tag(b, 'summary')), pub: strip(tag(b, 'source')), puburl: attr(b, 'source', 'url'), ts: Date.parse(strip(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated'))) || 0 }));

const norm = s => String(s || '').toLowerCase().replace(/[’‘`]/g, "'").normalize('NFD').replace(/[̀-ͯ]/g, '');
const ART = /(^|[^a-z])((art|arts|dessin|huile|photo|couleur|portrait|croquis|bronze|musee|museum)(?![a-z])|artist|peint|paint|drawing|sculpt|aquarelle|watercolor|acrylique|gravure|printmaking|ceramiq|ceramic|photograph|illustration|design graphique|graphic design|esthetique|aesthetic|color theory|sketch|calligraph|batik|tissage|modelage|curat|commissariat|bande dessinee|bandes dessinees)/;
const COURS = /(cours|course|formation|mooc|masterclass|atelier|workshop|tutoriel|tutorial|apprendre|learn|initiation|stage|classe|lesson|lecon|certificat|diplome|ecole)/;
const JUNK = /(artificiel|automotive|auto design|ventilation|publier en ligne|k–6|k-6|k–12|k-12|martial|state of the art|art of war|intelligence artificielle|artificial intelligence|machine learning|crypto|football|cuisine|recette|marketing|blockchain|nft trading)/;
const cat = x => { const s = norm(x.t + ' ' + x.d);
  if (/abidjan|cote d'ivoire|ivoirien|bingerville|bassam/.test(s)) return 'En Côte d’Ivoire';
  if (/histoire de l'art|histoires d'art|art history|pop art|street art|art urbain|elles font l'art|louvre|beaubourg|moma|renaissance|moderne|modern art|contemporain|contemporary|museum|musee|antiquite|ancient|african art|art africain/.test(s)) return 'Histoire de l’art';
  if (/philosoph|esthetique|aesthetic|theorie|theory|critique|semiolog/.test(s)) return 'Philosophie et théorie';
  if (/photo/.test(s)) return 'Photographie';
  if (/peinture|painting|dessin|drawing|aquarelle|watercolor|acrylique|huile|sculpt|gravure|ceramiq|croquis|sketch|portrait|couleur|color|illustration|modelage/.test(s)) return 'Techniques et pratique';
  return 'Autres formations'; };
const court = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };

const items = []; const bilan = [];
const add = (src, lang, l, opt = {}) => { let n = 0; for (const x of l) { if (!x || !x.t || !/^https:\/\//.test(x.url || '')) continue; const s = norm(x.t + ' ' + (x.d || ''));
    if (!ART.test(s) || JUNK.test(s) || (opt.cours && !COURS.test(s))) continue;
    let t = x.t; if (x.pub && t.endsWith(' - ' + x.pub)) t = t.slice(0, -(x.pub.length + 3));
    items.push({ t: court(t, 110), d: court(x.d && norm(x.d).startsWith(norm(t).slice(0, 30)) ? '' : x.d, 190), src: x.pub || x.src || src, site: x.puburl || '', url: x.url, lang, free: !!(opt.free || x.free), ty: opt.ty || (src.startsWith('Google') ? 'article' : 'cours'), ts: x.ts || 0 }); n++; } bilan.push(`${src} : ${n}`); };
const essai = async (nom, f) => { try { await f(); } catch (e) { bilan.push(`${nom} : indisponible (${String(e.message || e).slice(0, 60)})`); } };

// FUN MOOC (France Université Numérique)
for (const q of ['art', 'histoire de l\'art', 'dessin', 'photographie'])
  await essai('FUN MOOC « ' + q + ' »', async () => { const j = await get(`https://www.fun-mooc.fr/api/v1.0/courses/?query=${encodeURIComponent(q)}&limit=15`, 1);
    add('FUN MOOC', 'fr', (j.objects || []).map(c => ({ t: typeof c.title === 'string' ? c.title : (c.title && (c.title.fr || c.title.en)) || '', d: typeof c.introduction === 'string' ? c.introduction : '', url: /^https:/.test(c.absolute_url || '') ? c.absolute_url : 'https://www.fun-mooc.fr' + (c.absolute_url || '') })), { free: true }); });
// Flux spécialisés
for (const [src, url, lang, opt] of [
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

// Enrichissement : vraie page (si possible), image et description officielles (balises de partage)
const meta = (h, k) => { const m = h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, 'i')); if (!m) return ''; const c = m[0].match(/content=["']([^"']*)["']/i); return c ? decode(c[1]).trim() : ''; };
const PLATEFORMES = /fun-mooc\.fr|coursera\.org|edx\.org|openclassrooms\.com|futurelearn\.com|khanacademy\.org|udemy\.com|domestika\.org|skillshare\.com|artexplora\.org|mooc/i;
async function page(u) { const c = new AbortController(), t = setTimeout(() => c.abort(), 12000);
  try { const r = await fetch(u, { signal: c.signal, redirect: 'follow', headers: { ...UA, accept: 'text/html' } }); if (!r.ok) return null; const h = (await r.text()).slice(0, 400000); return { url: r.url, h }; } catch (e) { return null; } finally { clearTimeout(t); } }
function gnDecode(u) { try { const m = u.match(/news\.google\.com\/rss\/articles\/([^?]+)/); if (!m) return ''; const b = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('latin1'); const h = b.match(/https?:\/\/[\x21-\x7e]+/); return h ? h[0].replace(/[\x00-\x1f\xa0-\xff].*$/, '') : ''; } catch (e) { return ''; } }
let nImg = 0, nUrl = 0;
for (let i = 0; i < final.length; i += 6) await Promise.all(final.slice(i, i + 6).map(async x => {
  let u = x.url; if (/news\.google\.com/.test(u)) { const d = gnDecode(u); if (/^https:\/\//.test(d) && !/google\./.test(d)) u = d; }
  const p = await page(u); if (!p) return; let fin = p.url; if (/news\.google\.com/.test(fin)) { const c = meta(p.h, 'og:url'); if (!/^https:\/\//.test(c) || /google\./.test(c)) return; fin = c; const p2 = await page(fin); if (!p2) return; p.h = p2.h; }
  if (fin !== x.url) { x.url = fin; nUrl++; }
  const img = meta(p.h, 'og:image') || meta(p.h, 'twitter:image'), ds = meta(p.h, 'og:description') || meta(p.h, 'description'), sn = meta(p.h, 'og:site_name');
  if (/^https:\/\//.test(img) && img.length < 600) { x.img = img; nImg++; }
  if (ds && ds.length > (x.d || '').length) x.d = court(strip(ds), 420);
  if (sn && sn.length < 60) x.src = sn;
  if (PLATEFORMES.test(x.url)) x.ty = 'cours';
}));
console.log(`Pages enrichies : ${nImg} images officielles, ${nUrl} adresses réelles retrouvées.`);
final.forEach(x => { x.ci = x.cat === 'En Côte d’Ivoire' || /abidjan|cote d.?ivoire|ivoirien|bingerville|bassam|yamoussoukro|bouake/.test(norm(x.t + ' ' + x.d)); });

console.log(bilan.join('\n')); console.log(`\n${final.length} formations retenues : ` + ordre.map(c => `${c} ${final.filter(x => x.cat === c).length}`).join(' · '));
let ancien = null; try { ancien = JSON.parse(await fs.readFile(OUT, 'utf8')); } catch (e) {}
if (final.length < 8 && ancien && (ancien.items || []).length >= final.length) { console.log('::warning::Trop peu de résultats cette fois : la sélection précédente est conservée.'); process.exit(0); }
await fs.mkdir('data', { recursive: true });
await fs.writeFile(OUT, JSON.stringify({ updated: Date.now(), items: final.map(({ ts, ...x }) => x) }, null, 1));
