/* Luisart · service worker : ouverture immédiate depuis l'appareil, mise à jour en arrière-plan */
const V='luisart-9bc16f43e9';
const SHELL=['./','./firebase-config.js','./luisart-firebase.js','./manifest.webmanifest','./icons/icon-192.png'];
const fresh=u=>fetch(new Request(u,{cache:'reload'}));
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>fresh(u).then(r=>{if(!r.ok)throw new Error(u);return c.put(u,r)})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);
  if(u.origin!==location.origin)return; // Firebase, polices, etc. : réseau direct
  if(u.pathname.includes('/music/')&&!u.pathname.endsWith('.json'))return; // musique : lecture directe
  if(u.pathname.includes('/p/'))return; // pages d'aperçu des liens partagés : toujours le réseau
  const put=(k,res)=>{if(res&&res.ok){const c=res.clone();caches.open(V).then(x=>x.put(k,c))}return res};
  // la page elle-même : version de l'appareil tout de suite ; la nouvelle version arrive avec le prochain service worker
  if(r.mode==='navigate'&&/\/(index\.html)?$/.test(u.pathname)){e.respondWith(caches.open(V).then(c=>c.match('./')).then(m=>m||fetch(r)).catch(()=>fetch(r)));return}
  // données qui changent (actualités, liste des musiques) : réseau d'abord, copie locale si hors ligne
  if(/\.json$/.test(u.pathname)){e.respondWith(fetch(r).then(res=>put(r,res)).catch(()=>caches.match(r)));return}
  // tout le reste (scripts, images, traductions) : copie locale d'abord
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>put(r,res))));
});
