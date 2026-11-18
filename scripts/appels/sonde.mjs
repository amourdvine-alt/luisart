// Sonde : quels sites d'appels à candidatures répondent, et que contiennent-ils ?
const C = process.argv.slice(2).length ? process.argv.slice(2) : [
 'https://www.opportunitiesforafricans.com/category/arts/feed/','https://www.opportunitiesforafricans.com/feed/',
 'https://www.culturefundingwatch.com/en/feed/','https://www.culturefundingwatch.com/fr/feed/',
 'https://www.transartists.org/en/rss.xml','https://www.transartists.org/en/rss/news',
 'https://on-the-move.org/rss.xml','https://on-the-move.org/news/rss','https://on-the-move.org/feed',
 'https://artmovesafrica.org/feed/','https://www.artmovesafrica.org/en/feed',
 'https://resartis.org/feed/','https://resartis.org/open-calls/feed/',
 'https://opportunitydesk.org/category/competitions/feed/','https://opportunitydesk.org/feed/',
 'https://www.afterschoolafrica.com/feed/','https://www.artquest.org.uk/opportunities/feed/',
 'https://www.re-title.com/rss/','https://artenda.net/feed','https://www.artrabbit.com/artist-opportunities',
 'https://www.artconnect.com/opportunities','https://www.callforentry.org/festivals_unique_info.php',
 'https://africultures.com/feed/','https://www.institutfrancais.com/fr/appels-a-projets',
 'https://www.cnap.fr/rss.xml','https://www.artshub.com.au/feed/','https://www.e-flux.com/rss/announcements/',
 'https://www.artjobs.com/rss.xml','https://www.goethe.de/rss/','https://www.fundsforngos.org/category/arts-culture/feed/',
 'https://www2.fundsforngos.org/category/arts-culture/feed/','https://www.youthop.com/rss','https://www.opportunitiescorners.com/feed/',
 'https://www.artist-opportunities.org/feed','https://artistcommunities.org/directory/opportunities',
];
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
for (const u of C) {
  try { const ctl=new AbortController();setTimeout(()=>ctl.abort(),15000);
    const r = await fetch(u,{signal:ctl.signal,redirect:'follow',headers:{'user-agent':UA,accept:'application/rss+xml,application/xml,text/html,*/*'}});
    const t = await r.text(); const items=(t.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi)||[]);
    const ti=items.slice(0,4).map(x=>(x.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').map(s=>s.replace(/<!\[CDATA\[|\]\]>/g,'').trim().slice(0,70));
    const dts=items.slice(0,4).map(x=>(x.match(/<pubDate>([^<]*)|<published>([^<]*)|<updated>([^<]*)/i)||[]).slice(1).find(Boolean)||'');
    const dl=(t.match(/deadline|date limite/gi)||[]).length;
    console.log(r.status, items.length?('RSS '+items.length+' éléments'):('HTML '+(t.length/1024|0)+'Ko'), 'mentions deadline:',dl,'|',u);
    ti.forEach((x,i)=>console.log('     ·',String(dts[i]).slice(0,16),x));
  } catch(e){ console.log('ERR', String(e.message||e).slice(0,50),'|',u) }
}
