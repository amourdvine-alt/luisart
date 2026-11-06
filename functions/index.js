// Fonctions serveur Luisart : accès au live (Agora).
// Principe : l'application ne connaît jamais le « certificat » Agora. Ce serveur fabrique le jeton
// après avoir vérifié l'identité de la personne, le rôle demandé et la limite d'invités sur scène.
'use strict';
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { RtcTokenBuilder, RtcRole } = require('agora-token');

admin.initializeApp();
const db = admin.firestore();

const AGORA_APP_ID = defineSecret('AGORA_APP_ID');
const AGORA_APP_CERT = defineSecret('AGORA_APP_CERT');

const MAX_GUESTS = 3;          // invités sur scène, plafond côté serveur
// Note : l'acceptation d'un invité doit aussi refuser au-delà de 3 (transaction Firestore côté artiste).
const TOKEN_TTL_S = 3600;      // jeton valable 1 heure
const LIVE_COLL = 'lives';

// Rôles demandés par l'application : 'host' (artiste), 'guest' (invité sur scène), 'audience' (spectateur)
exports.liveToken = onCall({ secrets: [AGORA_APP_ID, AGORA_APP_CERT], region: 'europe-west1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Connexion requise.');
  const uid = req.auth.uid;
  const { liveId, role } = req.data || {};
  if (typeof liveId !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(liveId)) throw new HttpsError('invalid-argument', 'Live invalide.');
  if (!['host', 'guest', 'audience'].includes(role)) throw new HttpsError('invalid-argument', 'Rôle invalide.');

  const ref = db.collection(LIVE_COLL).doc(liveId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Ce live n’existe pas.');
  const live = snap.data();
  if ((live.st || live.status) !== 'on') throw new HttpsError('failed-precondition', 'Ce live n’est pas en cours.');

  if (role === 'host') {
    if ((live.host || live.hostUid || liveId) !== uid) throw new HttpsError('permission-denied', 'Seule l’artiste peut diffuser ce live.');
  } else if (role === 'guest') {
    // L'invité doit avoir été accepté par l'artiste, et la limite n'est pas dépassée.
    const g = (live.guests || []);
    if (!g.includes(uid)) throw new HttpsError('permission-denied', 'Vous n’êtes pas invité sur scène.');
    // La même limite doit être appliquée au moment où l'artiste accepte un invité (voir la note ci-dessous).
    if (g.indexOf(uid) >= MAX_GUESTS) throw new HttpsError('resource-exhausted', 'Scène complète.');
  }

  const appId = AGORA_APP_ID.value();
  const cert = AGORA_APP_CERT.value();
  const agoraRole = role === 'audience' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
  const now = Math.floor(Date.now() / 1000);
  // L'identifiant Agora de chaque personne est un entier : on en dérive un stable à partir de l'uid.
  const agoraUid = Math.abs(hash32(uid)) % 2000000000 || 1;
  const token = RtcTokenBuilder.buildTokenWithUid(appId, cert, liveId, agoraUid, agoraRole, TOKEN_TTL_S, now + TOKEN_TTL_S);
  return { appId, token, uid: agoraUid, expiresAt: (now + TOKEN_TTL_S) * 1000 };
});

function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}
