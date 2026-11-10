// Diagnostic : crée un compte de test comme le ferait un nouveau visiteur, relève l'erreur exacte,
// puis efface tout ce qui a été créé. N'affiche aucune donnée personnelle.
'use strict';
const { chromium } = require('playwright');
const admin = require('firebase-admin');
const crypto = require('crypto');
(async () => {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT; let fs = null;
  if (sa) { admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)), projectId: 'luisart-21e0b' }); fs = admin.firestore(); }
  // 1. réglages et règles publiées
  if (fs) {
    try { const s = (await fs.doc('cfg/site').get()).data() || {}; console.log('cfg/site : memm =', JSON.stringify(s.memm), '| roles =', JSON.stringify(s.roles), '| beta =', JSON.stringify(s.beta), '| champs :', Object.keys(s).sort().join(',')); } catch (e) { console.log('cfg/site illisible', e.code || e.message); }
    try {
      const rs = await admin.securityRules().getFirestoreRuleset(); const src = (rs.source[0] || {}).content || '';
      const local = require('fs').readFileSync('firestore.rules', 'utf8'); const h = x => crypto.createHash('sha1').update(x.replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 10);
      console.log('règles publiées :', rs.createTime, '| identiques au dépôt :', h(src) === h(local), '| tailles', src.length, local.length);
      if (h(src) !== h(local)) { const a = src.split('\n').map(l => l.trim()).filter(Boolean), b = new Set(local.split('\n').map(l => l.trim())); const d = a.filter(l => !b.has(l)); console.log('lignes publiées absentes du dépôt (' + d.length + ') :'); d.slice(0, 40).forEach(l => console.log('   ' + l.slice(0, 200))); const a2 = new Set(a), d2 = local.split('\n').map(l => l.trim()).filter(l => l && !a2.has(l)); console.log('lignes du dépôt absentes des règles publiées (' + d2.length + ') :'); d2.slice(0, 40).forEach(l => console.log('   ' + l.slice(0, 200))); }
    } catch (e) { console.log('règles publiées illisibles :', e.code || e.message); }
    try { // état des inscriptions récentes : noms de champs seulement
      const since = Date.now() - 6 * 3600e3; const pv = await fs.collection('priv').where('ts', '>', since).get();
      console.log('coordonnées enregistrées depuis 6 h :', pv.size);
      for (const d of pv.docs) { const a = await fs.doc('artists/' + d.id).get(); console.log('   il y a', Math.round((Date.now() - d.data().ts) / 60000), 'min | profil créé :', a.exists, a.exists ? '| mem=' + a.data().mem + ' | champs : ' + Object.keys(a.data()).sort().join(',') : ''); }
    } catch (e) { console.log('priv illisible', e.code || e.message); }
  }
  if (fs) {
    try { // comptes : uniquement des nombres
      let n = 0, anon = 0, d24 = 0, act2h = 0, tok = undefined; const now = Date.now();
      do { const l = await admin.auth().listUsers(1000, tok); tok = l.pageToken; for (const u of l.users) { n++; if (!u.providerData.length) anon++; if (now - Date.parse(u.metadata.creationTime) < 864e5) d24++; if (u.metadata.lastRefreshTime && now - Date.parse(u.metadata.lastRefreshTime) < 2 * 3600e3) act2h++; } } while (tok);
      console.log('comptes :', n, '| anonymes :', anon, '| créés depuis 24 h :', d24, '| actifs depuis 2 h :', act2h);
    } catch (e) { console.log('comptes illisibles', e.code || e.message); }
    try { // fiches privées qui ne respecteraient pas les règles (types et longueurs seulement)
      const all = await fs.collection('priv').get(); let bad = 0;
      for (const d of all.docs) { const x = d.data(), pb = []; if (x.uid !== d.id) pb.push('uid≠id'); for (const [k, m] of [['tel', 20], ['mail', 120], ['wa', 20]]) if (k in x && (typeof x[k] !== 'string' || x[k].length > m)) pb.push(k + ':' + typeof x[k] + '/' + String(x[k]).length); if (pb.length) { bad++; console.log('   fiche privée non conforme :', pb.join(' '), '| profil existe :', (await fs.doc('artists/' + d.id).get()).exists); } }
      console.log('fiches privées :', all.size, '| non conformes :', bad);
    } catch (e) { console.log('priv (contrôle) illisible', e.code || e.message); }
    try { const ar = await fs.collection('artists').get(); console.log('profils :', ar.size, '| en attente :', ar.docs.filter(d => d.data().mem === 'att').length); } catch (e) { console.log('profils illisibles', e.code || e.message); }
  }
  // 2. inscription réelle depuis le site
  const b = await chromium.launch(); const pg = await (await b.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
  const logs = []; pg.on('console', m => { if (/error|warn/.test(m.type())) logs.push(m.text().slice(0, 300)); }); pg.on('pageerror', e => logs.push('PAGE ' + String(e).slice(0, 300)));
  await pg.goto('https://amourdvine-alt.github.io/luisart/', { waitUntil: 'load', timeout: 90000 });
  await pg.waitForFunction("typeof uid!=='undefined'&&!!uid&&typeof db!=='undefined'&&!!db&&window.__cfgok", null, { timeout: 60000 }).catch(() => console.log('application pas prête (uid/db/cfg)'));
  const r = await pg.evaluate(async () => {
    const r = {}; const u = firebase.auth().currentUser;
    r.uid = !!uid; r.memeId = !!u && uid === u.uid; r.anonyme = u && u.isAnonymous; r.memm = CFGS.memm; r.mode = memMode(); r.dejaProfil = !!A[uid]; r.lectureSeule = typeof RO !== 'undefined' ? RO : '?'; r.dbRo = !!db.__ro; r.demo = typeof DEMO !== 'undefined' ? DEMO : '?';
    const E = e => (e && (e.code || '')) + ' | ' + String(e && e.message || e).slice(0, 220);
    try { await privSave(uid, { tel: '0700000000', mail: '' }); r.priv = 'ok' } catch (e) { r.priv = E(e) }
    const o = { name: 'Test technique Luisart', role: 'fan', ct: 'tel', since: Date.now(), mem: 'att', mts: Date.now(), memwhy: '', disc: "Amateur d'art" };
    try { await db.doc('artists/' + uid).set(o); r.profilEnAttente = 'ok' } catch (e) { r.profilEnAttente = E(e) }
    try { await db.doc('artists/' + uid).set({ ...o, mem: 'ok' }); r.profilConfirme = 'ok' } catch (e) { r.profilConfirme = E(e) }
    try { await db.doc('artists/' + uid).set({ ...o, name: 'Test technique Luisart 2' }); r.modification = 'ok' } catch (e) { r.modification = E(e) }
    r.id = uid; return r;
  }).catch(e => ({ echec: String(e).slice(0, 400) }));
  const id = r.id; delete r.id; console.log('ESSAI DIRECT', JSON.stringify(r, null, 1));
  // 3. le vrai formulaire, sur un 2e visiteur
  const pg2 = await (await b.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
  const al = []; pg2.on('dialog', d => { al.push('ALERTE: ' + d.message().slice(0, 200)); d.dismiss().catch(() => { }); }); pg2.on('console', m => { if (/error|warn/.test(m.type())) al.push(m.text().slice(0, 300)); }); pg2.on('pageerror', e => al.push('PAGE ' + String(e).slice(0, 300)));
  await pg2.goto('https://amourdvine-alt.github.io/luisart/', { waitUntil: 'load', timeout: 90000 });
  await pg2.waitForFunction("typeof uid!=='undefined'&&!!uid&&typeof db!=='undefined'&&!!db&&window.__cfgok", null, { timeout: 60000 }).catch(() => { });
  const r2 = await pg2.evaluate(async () => {
    const orig = db.doc; const tr = [];
    for (let i = 0; i < 40 && !DEMO; i++) await new Promise(z => setTimeout(z, 250));
    started = true; const l = document.getElementById('lx'); if (l) l.remove(); v = 'join'; render(); await new Promise(z => setTimeout(z, 800));
    const g = i => document.getElementById(i); const out = { champs: ['jn', 'jtel', 'jmail', 'jok'].map(i => i + ':' + !!g(i)).join(' ') };
    if (g('jn')) { g('jn').value = 'Test technique Luisart'; g('jn').dispatchEvent(new Event('input', { bubbles: true })); }
    if (g('jtel')) { g('jtel').value = '0700000001'; g('jtel').dispatchEvent(new Event('input', { bubbles: true })); }
    if (g('jok')) g('jok').checked = true;
    const t0 = []; const ot = window.toast; try { window.toast = m => { t0.push(String(m)); return ot && ot(m) } } catch (e) { }
    try { await act('jsend') } catch (e) { out.exception = String(e && e.stack || e).slice(0, 500) }
    await new Promise(z => setTimeout(z, 2500));
    out.messages = [...document.querySelectorAll('.toast,#toast,.tst')].map(x => x.textContent).join(' | '); out.vue = v; out.profil = !!A[uid]; out.mem = (A[uid] || {}).mem; out.demo = DEMO; out.stl = typeof STL === 'function' ? STL() : '?'; out.err = window.__lastErr || null; out.id = uid; return out;
  }).catch(e => ({ echec: String(e).slice(0, 400) }));
  const id2 = r2.id; delete r2.id; console.log('FORMULAIRE', JSON.stringify(r2, null, 1)); console.log('journal page 1 :', JSON.stringify(logs.slice(0, 8))); console.log('journal page 2 :', JSON.stringify(al.slice(0, 8)));
  await b.close();
  // 4. nettoyage
  if (fs) for (const i of [id, id2]) { if (!i) continue; for (const p of ['artists/', 'priv/']) await fs.doc(p + i).delete().catch(() => { }); await admin.auth().deleteUser(i).catch(() => { }); }
  console.log('comptes de test effacés');
})().catch(e => { console.error('ÉCHEC DU DIAGNOSTIC', e); process.exit(1); });
