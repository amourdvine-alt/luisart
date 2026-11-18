const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get=async u=>{const ctl=new AbortController();setTimeout(()=>ctl.abort(),20000);const r=await fetch(u,{signal:ctl.signal,redirect:'follow',headers:{'user-agent':UA,'accept-language':'en,fr;q=0.8'}});return await r.text()};
const show=(lab,t,re,n=3,w=500)=>{let k=0,m;const R=new RegExp(re,'gi');while((m=R.exec(t))&&k<n){console.log('['+lab+']',t.slice(Math.max(0,m.index-w/2),m.index+w/2).replace(/\s+/g,' '));k++}};
const T={};
for (const [k,u] of [['otm','https://on-the-move.org/feed'],['ofa','https://www.opportunitiesforafricans.com/feed/'],['ar','https://www.artrabbit.com/artist-opportunities'],['ac','https://www.artconnect.com/opportunities'],['aac','https://artistcommunities.org/directory/opportunities']]) { try{T[k]=await get(u);console.log('==',k,T[k].length)}catch(e){console.log('ERR',k,e.message)} }
const it=(T.otm.match(/<item\b[\s\S]*?<\/item>/gi)||[])[2]||'';console.log('[otm item]',it.slice(0,1800).replace(/\s+/g,' '));
const it2=(T.ofa.match(/<item\b[\s\S]*?<\/item>/gi)||[])[0]||'';console.log('[ofa item]',it2.slice(0,1200).replace(/\s+/g,' '));
show('ar',T.ar,'deadline',2,900);
console.log('[ac next]', /__NEXT_DATA__/.test(T.ac), (T.ac.match(/"deadline"\s*:\s*"[^"]+"/g)||[]).slice(0,3));show('ac',T.ac,'"deadline"',1,1600);
show('aac',T.aac,'deadline',2,900);
