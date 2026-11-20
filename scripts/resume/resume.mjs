// Luisart · résumés automatiques des actualités et des appels, écrits par une IA libre (gratuite)
// qui tourne sur le robot GitHub (llama.cpp). Le texte est reformulé en français : on ne recopie jamais l'annonce.
// PART=k NPARTS=n : ce robot traite la part k sur n. Sortie : out/resumes-k.json
import fs from 'fs';
import crypto from 'crypto';
const PART = +(process.env.PART || 0), NPARTS = +(process.env.NPARTS || 1), LIMIT = +(process.env.LIMIT || 0), PROBE = !!process.env.PROBE;
const SERVER = process.env.LLM || 'http://127.0.0.1:8080', MODEL = process.env.MODEL_NAME || 'ia-libre';
const DEADLINE = Date.now() + (+(process.env.MAX_MIN || 50)) * 60e3;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const d = JSON.parse(fs.readFileSync('data/news-auto.json', 'utf8'));
let cache = {}; try { cache = JSON.parse(fs.readFileSync('data/resumes.json', 'utf8')); } catch {}
export const keyOf = x => crypto.createHash('sha1').update((x.title || '') + '|' + (x.link || '')).digest('hex').slice(0, 12);
const done = x => { const c = cache[x.id]; return c && c.k === keyOf(x) && (c.r || (c.fail || 0) >= 3); };
let todo = d.items.filter(x => x.link && !/news\.google\./.test(x.link) && !done(x)).sort((a, b) => a.id < b.id ? -1 : 1);
todo = todo.filter((_, i) => i % NPARTS === PART); if (LIMIT) todo = todo.slice(0, LIMIT);
console.log(`Part ${PART + 1}/${NPARTS} : ${todo.length} annonces à résumer`);

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô' };
const dec = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
function pageText(html) {
  let h = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|button|select)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const pick = tag => { const all = [...h.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi'))].map(m => m[1]); return all.sort((a, b) => b.length - a.length)[0] || ''; };
  let core = pick('article'); if (core.replace(/<[^>]+>/g, '').length < 600) core = pick('main'); if (core.replace(/<[^>]+>/g, '').length < 600) core = h;
  const t = dec(core.replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l.length > 30 && !/cookie|newsletter|subscribe|abonnez|tous droits|all rights reserved|share this|partager/i.test(l)).join('\n');
  return t.slice(0, 7000);
}
async function getText(x) {
  try { const r = await fetch(x.link, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (r.ok) { const t = pageText((await r.text()).slice(0, 2e6)); if (t.length > 400) return t; } } catch {}
  return (x.text || '').length > 200 ? x.text : '';
}
const SCHEMA = { type: 'object', properties: { titre: { type: 'string' }, resume: { type: 'string' } }, required: ['titre', 'resume'] };
async function ask(x, src, temp, strict) {
  const call = x.cat === 'Appels à candidatures';
  const msg = [
    { role: 'system', content: "Tu es rédacteur pour Luisart, une application pour artistes en Côte d'Ivoire. Tu écris en français simple et correct. Tu reformules avec tes propres mots, tu ne recopies jamais des phrases du texte. Tu n'inventes rien : une information absente du texte n'apparaît pas dans le résumé." },
    { role: 'user', content: `Catégorie : ${x.cat}\nTitre d'origine : ${x.title}\nSource : ${x.sub || ''}\n${x.deadline ? 'Date limite vérifiée : ' + x.date.replace(/^.*Date limite : /, '') + '\n' : ''}\nTexte de l'annonce :\n"""\n${src}\n"""\n\nRéponds en JSON avec :\n- "titre" : le titre traduit en français, court et clair (12 mots maximum).\n- "resume" : un résumé de 4 à 7 phrases en français. ${call ? "Dis de quoi il s'agit, qui organise, où, à qui c'est ouvert (conditions), ce qui est offert (bourse, résidence, prix, exposition), s'il y a des frais, comment postuler et la date limite si elle est donnée." : "Dis de quoi il s'agit, qui, où, quand, et ce qu'il faut retenir pour un artiste."} Pas de liste, pas de lien, pas de titre dans le résumé.${strict ? " IMPORTANT : reformule entièrement avec des phrases courtes et différentes ; ne reprends aucune suite de plus de 5 mots du texte, et n'écris aucun nombre qui n'est pas dans le texte." : ''}` }];
  const r = await fetch(SERVER + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(600000),
    body: JSON.stringify({ model: MODEL, messages: msg, temperature: temp, max_tokens: 450, response_format: { type: 'json_object', schema: SCHEMA } }) });
  const j = await r.json(); const c = j.choices?.[0]?.message?.content || '';
  return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1));
}
// Contrôles : vraiment en français, pas recopié, aucun chiffre inventé
const FR = /\b(le|la|les|des|une|est|pour|dans|avec|qui|sont|et|du|aux|sur)\b/gi, EN = /\b(the|and|for|with|are|is|to|of|will|this|that)\b/gi;
function check(o, src) {
  const r = String(o.resume || '').trim(), t = String(o.titre || '').trim();
  if (r.length < 180 || r.length > 1400 || !t || t.length > 140) return 'longueur';
  const fr = (r.match(FR) || []).length, en = (r.match(EN) || []).length; if (fr < 6 || en > fr / 3) return 'pas en français';
  const sw = src.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean), rw = r.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const grams = new Set(); for (let i = 0; i + 10 <= sw.length; i++) grams.add(sw.slice(i, i + 10).join(' '));
  for (let i = 0; i + 10 <= rw.length; i++) if (grams.has(rw.slice(i, i + 10).join(' '))) return 'recopié';
  const digits = s => (s.match(/\d[\d\s.,]*\d|\d/g) || []).map(n => n.replace(/[\s.,]/g, '')).filter(n => n.length >= 2);
  const it0 = d.items.find(i => i.id === o._id) || {}; const sd = new Set(digits(src + ' ' + (it0.title || '') + ' ' + (it0.text || '') + ' ' + (it0.date || '') + ' ' + (it0.deadline || '').replace(/-/g, ' '))); const bad = digits(r + ' ' + t).filter(n => !sd.has(n) && !(+n <= 31));
  if (bad.length) return 'chiffre absent du texte : ' + bad.join(',');
  return '';
}
const out = {}; let ok = 0, skip = 0, fail = 0;
for (const x of todo) {
  if (Date.now() > DEADLINE) { console.log('Temps écoulé : le reste sera fait au prochain passage'); break; }
  const t0 = Date.now(); const src = await getText(x);
  const prevFail = (cache[x.id] && cache[x.id].k === keyOf(x) && cache[x.id].fail) || 0;
  if (!src) { skip++; out[x.id] = { k: keyOf(x), fail: prevFail + 1, ts: Date.now() }; console.log('— pas de texte lisible :', x.title.slice(0, 60)); continue; }
  let res = null, why = '';
  for (const [temp, strict] of [[0.3, 0], [0.1, 0], [0.5, 1]]) { try { const o = await ask(x, src, temp, strict); o._id = x.id; why = check(o, src); if (!why) { res = o; break; } } catch (e) { why = 'erreur ' + String(e.message || e).slice(0, 60); } }
  const s = ((Date.now() - t0) / 1000).toFixed(0);
  if (!res) { fail++; out[x.id] = { k: keyOf(x), fail: prevFail + 1, ts: Date.now() }; console.log(`✗ ${s}s ${why} | ${x.title.slice(0, 60)}`); continue; }
  ok++; out[x.id] = { k: keyOf(x), titre: res.titre.trim(), r: res.resume.trim(), ts: Date.now() };
  console.log(`✓ ${s}s | ${x.title.slice(0, 60)}`); if (PROBE) console.log(`   → ${res.titre}\n   ${res.resume}\n`);
}
fs.mkdirSync('out', { recursive: true }); fs.writeFileSync(`out/resumes-${PART}.json`, JSON.stringify(out));
console.log(`Fini : ${ok} résumés, ${fail} refusés par les contrôles, ${skip} sans texte`);
