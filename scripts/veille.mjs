/* Luisart · robot de veille (actualités de l'art et appels à candidatures)
   Tourne chaque jour sur GitHub Actions, sans Claude ni serveur.
   Lit des flux RSS fiables, trie, classe, détecte les dates limites,
   et écrit data/news-auto.json que l'application affiche. */
import fs from 'node:fs/promises';

const OUT = 'data/news-auto.json';
const NOW = Date.now();
const DAY = 86400000;
const MAX_ITEMS = 60;          // nombre d'actualités gardées
const MAX_AGE_DAYS = 40;       // âge max d'un article sans date limite
const TIMEOUT = 15000;

const gn = (q, lang = 'fr', gl = 'CI') =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${lang}&gl=${gl}&ceid=${gl}:${lang}`;

/* Sources : flux spécialisés + recherches ciblées (Côte d'Ivoire, Afrique, appels) */
const SOURCES = [
  // Appels à candidatures, résidences, prix
  { url: gn('"appel à candidatures" artistes Afrique'), src: 'Google Actualités', hint: 'call' },
  { url: gn('"appel à candidatures" résidence artistique'), src: 'Google Actualités', hint: 'call' },
  { url: gn('"open call" African artists', 'en', 'NG'), src: 'Google News', hint: 'call' },
  { url: gn('artist residency "open call" 2027', 'en', 'US'), src: 'Google News', hint: 'call' },
  { url: gn('prix art contemporain Afrique candidature'), src: 'Google Actualités', hint: 'call' },
  { url: 'https://www.transartists.org/en/rss.xml', src: 'TransArtists', hint: 'call' },
  { url: 'https://www.e-flux.com/rss/announcements/', src: 'e-flux' },
  // Côte d'Ivoire
  { url: gn('exposition Abidjan'), src: 'Google Actualités', hint: 'local' },
  { url: gn('vernissage Abidjan'), src: 'Google Actualités', hint: 'local' },
  { url: gn('artiste ivoirien peinture'), src: 'Google Actualités', hint: 'local' },
  { url: gn('art contemporain "Côte d\'Ivoire"'), src: 'Google Actualités', hint: 'local' },
  // Afrique et monde
  { url: gn('art contemporain africain'), src: 'Google Actualités' },
  { url: gn('biennale Dak\'Art OR "biennale de Dakar" OR "Biennale de Lubumbashi"'), src: 'Google Actualités', hint: 'major' },
  { url: gn('"contemporary African art"', 'en', 'GB'), src: 'Google News' },
  { url: 'https://contemporaryand.com/feed/', src: 'Contemporary And' },
  { url: 'https://www.artnews.com/feed/', src: 'ARTnews', hint: 'world' },
  { url: 'https://hyperallergic.com/feed/', src: 'Hyperallergic', hint: 'world' },
  { url: 'https://www.beauxarts.com/feed/', src: 'Beaux Arts Magazine', hint: 'world' },
  { url: 'https://www.connaissancedesarts.com/feed/', src: 'Connaissance des Arts', hint: 'world' },
];

/* ---------------- lecture XML (RSS 2.0 et Atom), sans dépendance ---------------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ecirc: 'ê', hellip: '…', ndash: '–', mdash: '—' };
const decode = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const strip = s => decode(decode(s)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (x, n) => { const m = x.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`, 'i')); return m ? m[1] : ''; };
const attr = (x, n, a) => { const m = x.match(new RegExp(`<${n}\\b[^>]*\\b${a}=["']([^"']+)["']`, 'i')); return m ? decode(m[1]) : ''; };

function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    let link = strip(tag(b, 'link')) || attr(b, 'link', 'href');
    const title = strip(tag(b, 'title'));
    const desc = strip(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content:encoded') || tag(b, 'content'));
    const date = Date.parse(strip(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'))) || 0;
    const img = attr(b, 'media:content', 'url') || attr(b, 'media:thumbnail', 'url') || attr(b, 'enclosure', 'url') || ((tag(b, 'content:encoded') || tag(b, 'description')).match(/<img[^>]+src=["']([^"']+)/i) || [])[1] || '';
    const source = strip(tag(b, 'source'));
    if (title && link) items.push({ title, link: link.trim(), desc, date, img: decode(img), source });
  }
  return items;
}

async function get(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (LuisartVeille; +https://amourdvine-alt.github.io/luisart/)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

/* ---------------- intelligence : classement, dates limites, pertinence ---------------- */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const has = (t, words) => words.some(w => t.includes(w));
const W = {
  call: ['appel a candidature', 'appel a projet', 'open call', 'call for artists', 'call for applications', 'call for entries', 'residence d\'artiste', 'residence artistique', 'artist residency', 'residency', 'bourse', 'grant', 'fellowship', 'prix ', 'prize', 'award', 'concours', 'competition', 'candidatez', 'apply now', 'deadline', 'date limite'],
  ci: ['abidjan', 'cote d\'ivoire', 'cote divoire', 'ivoirien', 'ivoirienne', 'ivory coast', 'bingerville', 'grand-bassam', 'yamoussoukro', 'bouake', 'insaac'],
  africa: ['afrique', 'africa', 'african', 'africain', 'dakar', 'lagos', 'accra', 'bamako', 'ouagadougou', 'kinshasa', 'lubumbashi', 'nairobi', 'johannesburg', 'cotonou', 'lome', 'douala', 'yaounde', 'marrakech', 'diaspora', 'senegal', 'nigeria', 'ghana', 'benin', 'cameroun', 'mali', 'burkina'],
  art: ['art', 'artiste', 'artist', 'peint', 'paint', 'exposition', 'exhibition', 'galerie', 'gallery', 'musee', 'museum', 'sculpt', 'photograph', 'biennale', 'biennial', 'vernissage', 'curat', 'commissaire', 'oeuvre', 'artwork', 'collection'],
  local: ['vernissage', 'exposition', 'expo ', 'galerie', 'exhibition', 'festival'],
  major: ['biennale', 'biennial', 'documenta', 'retrospective', 'museum', 'musee', 'louvre', 'tate', 'moma', 'pompidou', 'zeitz', 'mocaa', 'art basel', 'frieze', '1-54'],
  event: ['festival', 'foire', 'art fair', 'salon', 'rencontre', 'conference', 'atelier', 'workshop', 'masterclass', 'forum'],
  junk: ['football', 'match', 'election', 'crypto', 'horoscope', 'recette', 'martial art', 'state of the art', 'art of the deal', 'mma', 'politique', 'tribunal', 'accident'],
};

const MONTHS = { janvier: 0, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11,
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const MN = '(' + Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|') + ')\\.?';
function findDates(t) {
  const out = [];
  let m;
  const r1 = new RegExp(`(\\d{1,2})(?:er|st|nd|rd|th)?\\s+${MN}\\s*,?\\s*(20\\d\\d)?`, 'g');
  while ((m = r1.exec(t))) out.push({ i: m.index, d: mk(+m[3] || 0, MONTHS[m[2]], +m[1]) });
  const r2 = new RegExp(`${MN}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(20\\d\\d)?`, 'g');
  while ((m = r2.exec(t))) out.push({ i: m.index, d: mk(+m[3] || 0, MONTHS[m[1]], +m[2]) });
  const r3 = /(\d{1,2})[\/.](\d{1,2})[\/.](20\d\d)/g;
  while ((m = r3.exec(t))) out.push({ i: m.index, d: mk(+m[3], +m[2] - 1, +m[1]) });
  return out.filter(x => x.d);
}
function mk(y, mo, d) {
  if (mo == null || d < 1 || d > 31) return 0;
  const now = new Date(NOW);
  if (!y) { y = now.getUTCFullYear(); if (Date.UTC(y, mo, d) < NOW - 60 * DAY) y++; }
  const v = Date.UTC(y, mo, d, 23, 59);
  return (v > NOW - 400 * DAY && v < NOW + 800 * DAY) ? v : 0;
}
function deadline(t) {
  const ds = findDates(t); if (!ds.length) return 0;
  const k = /(date limite|deadline|cloture|avant le|jusqu'?au|until|apply by|due|closes?|limite de depot|au plus tard)/g;
  let m, best = 0;
  while ((m = k.exec(t))) { const near = ds.filter(x => x.i > m.index && x.i - m.index < 60).sort((a, b) => a.i - b.i)[0]; if (near) { best = near.d; break; } }
  return best;
}
function period(t) {
  const ds = findDates(t).map(x => x.d).filter(d => d > NOW - 30 * DAY).sort((a, b) => a - b);
  if (!ds.length) return {};
  const r = /(du|from)\s/.test(t) && ds.length > 1 ? { start: ds[0], end: ds[ds.length - 1] } : { start: ds[0] };
  return r;
}
const iso = v => v ? new Date(v).toISOString().slice(0, 10) : '';
const fr = v => { const d = new Date(v); return d.getUTCDate() + ' ' + ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'][d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };

function classify(it, hint) {
  const t = norm(it.title + ' ' + it.desc);
  if (has(t, W.junk) && !has(t, W.art.slice(1))) return null;
  if (!has(t, W.art)) return null;
  const ci = has(t, W.ci), af = ci || has(t, W.africa), call = has(t, W.call) || hint === 'call';
  let cat;
  if (call && (has(t, W.call))) cat = 'Appels à candidatures';
  else if (ci && has(t, W.local)) cat = 'Vernissages locaux';
  else if (has(t, W.major)) cat = 'Expositions majeures';
  else if (has(t, W.event)) cat = 'Événements';
  else if (af) cat = 'Nouveautés';
  else cat = 'Art mondial';
  let score = 0;
  if (ci) score += 6; if (af) score += 3; if (cat === 'Appels à candidatures') score += 4;
  if (hint === 'local' && ci) score += 2;
  const age = it.date ? (NOW - it.date) / DAY : 20;
  score += Math.max(0, 5 - age / 4);
  if (it.img) score += 0.5;
  return { cat, score, ci, af, t };
}

const KEYW = t => new Set(norm(t).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length > 3));
const similar = (a, b) => { const A = KEYW(a), B = KEYW(b); if (!A.size || !B.size) return false; let n = 0; A.forEach(w => B.has(w) && n++); return n / Math.min(A.size, B.size) >= 0.7; };
const hash = s => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0; return h.toString(36); };

function cleanTitle(it) {
  let t = it.title, src = it.source;
  const m = t.match(/^(.*)\s[-–|]\s([^-–|]{2,60})$/);   // « Titre - Journal » (Google Actualités)
  if (m && (!src || norm(m[2]).includes(norm(src).slice(0, 6)) || it.link.includes('news.google'))) { t = m[1]; src = src || m[2]; }
  return { title: t.trim(), source: src };
}
const cut = (s, n) => s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)).replace(/[,;:]$/, '') + '…';

/* ---------------- programme principal ---------------- */
async function main() {
  let previous = [];
  try { previous = JSON.parse(await fs.readFile(OUT, 'utf8')).items || []; } catch {}
  const stats = { ok: 0, fail: 0, read: 0 };
  const results = await Promise.allSettled(SOURCES.map(async s => {
    const xml = await get(s.url); const items = parseFeed(xml);
    stats.ok++; stats.read += items.length; return items.map(i => ({ ...i, _s: s }));
  }));
  results.forEach((r, k) => { if (r.status === 'rejected') { stats.fail++; console.warn('✗', SOURCES[k].src, SOURCES[k].url.slice(0, 90), String(r.reason).slice(0, 80)); } });
  const raw = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  const fresh = [];
  for (const it of raw) {
    const c = classify(it, it._s.hint); if (!c) continue;
    const { title, source } = cleanTitle(it);
    const dl = c.cat === 'Appels à candidatures' ? deadline(c.t) : 0;
    if (dl && dl < NOW - DAY) continue;                                    // appel déjà clos
    if (!dl && it.date && NOW - it.date > MAX_AGE_DAYS * DAY) continue;    // trop ancien
    const pr = c.cat === 'Appels à candidatures' ? {} : period(c.t);
    if (pr.end && pr.end < NOW - DAY) continue;                             // événement terminé
    const date = dl ? 'Date limite : ' + fr(dl)
      : pr.end ? 'Du ' + fr(pr.start) + ' au ' + fr(pr.end)
      : pr.start && pr.start > NOW ? 'À partir du ' + fr(pr.start)
      : it.date ? 'Publié le ' + fr(it.date) : '';
    fresh.push({
      id: 'auto_' + hash(it.link),
      cat: c.cat, title: cut(title, 140), sub: source || it._s.src,
      text: cut(it.desc && norm(it.desc) !== norm(title) ? it.desc : '', 420),
      date, deadline: iso(dl), start: iso(pr.start), end: iso(pr.end),
      place: c.ci ? "Côte d'Ivoire" : '', country: c.ci ? "Côte d'Ivoire" : '',
      link: it.link, src: source || it._s.src, img: /^https:\/\//.test(it.img) ? it.img : '',
      ts: it.date || NOW, auto: 1, _score: c.score,
    });
  }

  // On garde les anciennes encore valides si une source tombe en panne
  for (const p of previous) {
    if (p.deadline && Date.parse(p.deadline) < NOW - DAY) continue;
    if (p.end && Date.parse(p.end) < NOW - DAY) continue;
    if (!p.deadline && NOW - (p.ts || 0) > MAX_AGE_DAYS * DAY) continue;
    fresh.push({ ...p, _score: (p._score || 2) - 1.5 });
  }

  fresh.sort((a, b) => b._score - a._score || b.ts - a.ts);
  const kept = [];
  for (const it of fresh) {
    if (kept.some(k => k.id === it.id || k.link === it.link || similar(k.title, it.title))) continue;
    kept.push(it);
  }
  // équilibre : au moins quelques appels et quelques nouvelles locales en tête
  const byCat = c => kept.filter(k => k.cat === c);
  const final = [...new Set([...byCat('Appels à candidatures').slice(0, 15), ...byCat('Vernissages locaux').slice(0, 10), ...kept])].slice(0, MAX_ITEMS);

  if (!final.length && previous.length) { console.warn('Aucune nouvelle donnée : on garde le fichier précédent.'); return; }
  const out = { updated: new Date(NOW).toISOString(), sources: { ok: stats.ok, fail: stats.fail, read: stats.read }, count: final.length,
    items: final.sort((a, b) => b.ts - a.ts).map(({ _score, ...x }) => ({ ...x, _score: Math.round(_score * 10) / 10 })) };
  await fs.mkdir('data', { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(out, null, 1));
  const cats = {}; final.forEach(f => cats[f.cat] = (cats[f.cat] || 0) + 1);
  console.log(`Sources OK ${stats.ok}/${SOURCES.length}, articles lus ${stats.read}, gardés ${final.length}`, cats);
}
main().catch(e => { console.error(e); process.exit(1); });
