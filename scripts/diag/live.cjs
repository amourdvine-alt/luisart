// Diagnostic des lives : lit les dernières tentatives de connexion et dit où elles se sont arrêtées.
// N'affiche ni nom, ni adresse réseau : seulement des présences de champs, des durées et des types.
'use strict';
const admin = require('firebase-admin');
(async () => {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)), projectId: 'luisart-21e0b' });
  const fs = admin.firestore(), now = Date.now(), min = t => t ? Math.round((now - t) / 60000) + ' min' : '—';
  const s = (await fs.doc('cfg/site').get()).data() || {}; console.log('serveur relais (TURN) réglé :', !!(s.turn && s.turn.urls));
  const lv = await fs.collection('lives').get(); console.log('lives enregistrés :', lv.size);
  for (const d of lv.docs) { const x = d.data(); console.log('  live | démarré il y a', min(x.ts), '| dernier signe de vie il y a', min(x.hb), '| transport :', x.tr || 'direct', '| spectateurs comptés :', x.n || 0, '| terminé :', !!x.end, '| champs :', Object.keys(x).sort().join(',')); }
  const typ = sdp => { const c = { host: 0, srflx: 0, prflx: 0, relay: 0 }; String(sdp || '').split(/\r?\n/).forEach(l => { const m = l.match(/^a=candidate:.* typ (\w+)/); if (m && m[1] in c) c[m[1]]++; }); const v6 = (String(sdp || '').match(/^a=candidate:\S+ \d+ \w+ \d+ [0-9a-f]*:[0-9a-f:]+ /gmi) || []).length; return `local ${c.host}, public ${c.srflx}, relais ${c.relay}` + (v6 ? `, dont IPv6 ${v6}` : ''); };
  const lj = await fs.collection('livej').get(); const l = lj.docs.map(d => d.data()).filter(x => now - (x.ts || 0) < 3 * 3600e3).sort((a, b) => b.ts - a.ts);
  console.log('tentatives de connexion depuis 3 h :', l.length, '(total enregistré :', lj.size + ')');
  for (const x of l.slice(0, 12)) console.log('  tentative il y a', min(x.ts), '| état :', x.st, '| demande envoyée :', !!x.offer, '| réponse du diffuseur :', !!x.answer, x.ta ? '(après ' + Math.round((x.ta - x.ts) / 1000) + ' s)' : '', '\n     adresses du spectateur :', typ(x.offer && x.offer.sdp), '\n     adresses du diffuseur  :', x.answer ? typ(x.answer.sdp) : '—');
})().catch(e => { console.error('ÉCHEC', e.code || e.message); process.exit(1); });
