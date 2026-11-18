import fs from 'fs';
const d = JSON.parse(fs.readFileSync('data/news-auto.json', 'utf8'));
const L = d.items.filter(x => x.cat === 'Appels à candidatures' && x.apply);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
for (const x of L) {
  if (/^mailto:/.test(x.apply) || /\.pdf/i.test(x.apply)) { console.log(`\n### ${x.applyKind} | ${x.title.slice(0, 50)}\n  ${x.apply}`); continue; }
  try {
    const r = await fetch(x.apply, { headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
    const h = await r.text();
    const title = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const names = [...h.matchAll(/<(?:input|textarea|select)\b[^>]*?(?:name|aria-label|placeholder)\s*=\s*["']([^"']{2,40})/gi)].map(m => m[1]).filter(n => !/^(_|csrf|token|search|s$)/i.test(n)).slice(0, 12);
    const labels = [...h.matchAll(/<label[^>]*>([\s\S]{2,80}?)<\/label>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean).slice(0, 8);
    const closed = /(no longer accepting|form is closed|currently unavailable|not accepting)/i.test(h);
    const txt = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const mention = (txt.match(/.{0,60}(fellowship|residency|bachardy|dumfries).{0,60}/i) || [''])[0];
    console.log(`\n### ${x.applyKind} | ${x.title.slice(0, 50)}\n  ${x.apply}\n  HTTP ${r.status} → ${r.url.slice(0, 100)}\n  titre: ${title.trim().slice(0, 100)}\n  champs: ${names.join(', ')}\n  labels: ${labels.join(' / ')}\n  fermé: ${closed}  ${x.title.includes('Bachardy') || x.title.includes('Dumfries') ? 'extrait: ' + mention : ''}`);
  } catch (e) { console.log(`\n### ${x.applyKind} | ${x.title.slice(0, 50)}\n  ${x.apply}\n  ERREUR ${e.message}`); }
}
