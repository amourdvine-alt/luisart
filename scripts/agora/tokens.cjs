// Robot des lives Agora : fabrique à l'avance les laissez-passer (jetons) de chaque artiste,
// sans serveur Firebase. Le certificat Agora reste dans les secrets GitHub et n'est jamais publié.
//  - cfg/agv                    : jetons « spectateur » de chaque live (lecture publique, ne permettent que de regarder)
//  - data/users/<uid>/agora     : jetons « artiste » et « invité sur scène » (lisibles par l'artiste seul)
// Les jetons valent 24 h ; le robot les renouvelle toutes les vingt minutes.
'use strict';
const admin = require('firebase-admin');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const TTL = 24 * 3600;
const h32 = x => { let h = 2166136261; x = String(x || ''); for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h | 0) % 2000000000 || 1; };
(async () => {
  const appId = (process.env.AGORA_APP_ID || '').trim(), cert = (process.env.AGORA_APP_CERT || '').trim();
  if (!/^[0-9a-f]{32}$/i.test(appId) || !/^[0-9a-f]{32}$/i.test(cert)) {
    console.log('::warning::Secrets Agora absents ou mal copiés (AGORA_APP_ID :', appId ? 'présent, ' + appId.length + ' caractères' : 'absent', '| AGORA_APP_CERT :', cert ? 'présent, ' + cert.length + ' caractères' : 'absent', '). Attendu : 32 caractères chacun.');
    return;
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const ar = await db.collection('artists').get();
  const ids = ar.docs.filter(d => { const x = d.data(); return /^[A-Za-z0-9_-]{6,80}$/.test(d.id) && x.susp !== -1 && !x.demo; }).map(d => d.id);
  const exp = Date.now() + TTL * 1000, t = {};
  let n = 0;
  const batchSize = 400;
  for (let i = 0; i < ids.length; i += batchSize) {
    const b = db.batch();
    for (const id of ids.slice(i, i + batchSize)) {
      t[id] = RtcTokenBuilder.buildTokenWithUid(appId, cert, id, 0, RtcRole.SUBSCRIBER, TTL, TTL);
      b.set(db.doc('data/users/' + id + '/agora'), {
        appId, ch: id, u: h32(id), exp, ts: Date.now(),
        h: RtcTokenBuilder.buildTokenWithUid(appId, cert, id, h32(id), RtcRole.PUBLISHER, TTL, TTL),
        g: RtcTokenBuilder.buildTokenWithUid(appId, cert, id, 0, RtcRole.PUBLISHER, TTL, TTL)
      });
      n++;
    }
    await b.commit();
  }
  const poids = JSON.stringify(t).length;
  if (poids > 600000) console.log('::warning::La liste des laissez-passer spectateurs approche de la limite (' + Math.round(poids / 1024) + ' Ko sur 1 000). Il faudra la répartir en plusieurs documents.');
  await db.doc('cfg/agv').set({ appId, exp, ts: Date.now(), t });
  console.log('laissez-passer renouvelés :', n, 'artistes | valables jusqu’à', new Date(exp).toISOString());
})().catch(e => { console.error('ÉCHEC', e.code || '', String(e.message || e).slice(0, 300)); process.exit(1); });
