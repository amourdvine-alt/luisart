// Robot de candidature Luisart.
// Rôle : quand l'artiste a cliqué « C'est fait » sur la page de candidature, le robot ouvre
// la même page dans son propre navigateur, repère les champs du formulaire, les pré-remplit
// avec le dossier de l'artiste et écrit un rapport. Il n'envoie JAMAIS le formulaire :
// le dernier clic reste à l'artiste.
// Limites assumées : il ne voit pas la session de l'artiste (connexion, captcha : signalés, pas contournés).
'use strict';

const LABEL_RULES = [
  { key: 'name',     re: /nom|name|artiste|prénom|prenom|full/i },
  { key: 'whatsapp', re: /t[ée]l|phone|mobile|whatsapp|portable/i },
  { key: 'city',     re: /ville|city|localit|adresse|address/i },
  { key: 'bio',      re: /pr[ée]sentation|bio|motivation|parcours|d[ée]crivez|message|about|lettre|description|projet/i },
];

// Lit le texte d'étiquette d'un champ (label, aria-label, placeholder, name) — exécuté dans la page.
function fieldInfo(el) {
  const id = el.id;
  let label = '';
  if (id) { const l = document.querySelector('label[for="' + CSS.escape(id) + '"]'); if (l) label = l.innerText; }
  if (!label) { const p = el.closest('label'); if (p) label = p.innerText; }
  return {
    label: (label || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '').trim().slice(0, 200),
    type: (el.type || el.tagName).toLowerCase(),
    tag: el.tagName.toLowerCase(),
    visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    filled: !!String(el.value || '').trim(),
  };
}

async function analyse(page, url, dossier) {
  const rapport = { champs_remplis: [], champs_manquants: [], fichiers_demandes: false, blocage: null, ts: Date.now() };
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1500);

  const text = (await page.evaluate(() => document.body ? document.body.innerText : '')).toLowerCase();
  const hasPassword = await page.$('input[type=password]');
  const hasCaptcha = await page.$('iframe[src*="captcha" i], iframe[src*="recaptcha" i], iframe[src*="hcaptcha" i], .g-recaptcha, .h-captcha, [data-sitekey]');
  if (hasCaptcha) rapport.blocage = 'captcha';
  else if (hasPassword || /se connecter|connexion requise|log ?in required|sign in/.test(text)) rapport.blocage = 'connexion';

  const fields = await page.$$('input, textarea, select');
  const infos = [];
  for (const f of fields) infos.push({ handle: f, info: await f.evaluate(fieldInfo) });

  const visibles = infos.filter(x => x.info.visible && !['hidden', 'submit', 'button', 'checkbox', 'radio', 'password', 'search'].includes(x.info.type));
  if (infos.some(x => x.info.type === 'file')) rapport.fichiers_demandes = true;

  if (!visibles.length && !rapport.blocage) {
    rapport.blocage = 'pas de formulaire sur la page';
    return rapport;
  }

  const demandes = new Set();
  for (const x of visibles) {
    if (x.info.filled || x.info.type === 'file') continue;
    const rule = LABEL_RULES.find(r => r.re.test(x.info.label));
    if (!rule) continue;
    demandes.add(rule.key);
    if (rule.key === 'bio' && x.info.tag !== 'textarea') continue;
    const value = dossier[rule.key];
    if (!value) { if (!rapport.champs_manquants.includes(rule.key)) rapport.champs_manquants.push(rule.key); continue; }
    try {
      await x.handle.fill(String(value), { timeout: 4000 });
      rapport.champs_remplis.push(rule.key);
    } catch (er) {
      rapport.champs_manquants.push(rule.key + ' (non saisissable)');
    }
  }
  // Champs non reconnus : signalés pour que l'artiste les traite lui-même
  const inconnus = visibles.filter(x => !x.info.filled && x.info.type !== 'file' && !LABEL_RULES.some(r => r.re.test(x.info.label)) && x.info.label);
  rapport.champs_a_traiter_par_artiste = inconnus.map(x => x.info.label).slice(0, 10);
  return rapport;
}

async function main() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) { console.log('FIREBASE_SERVICE_ACCOUNT absent : rien à faire.'); return; }
  const admin = require('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)), projectId: 'luisart-21e0b' });
  const db = admin.firestore();
  const { chromium } = require('playwright');

  const snap = await db.collectionGroup('cand').where('st', '==', 'relais').limit(20).get();
  console.log('Candidatures à traiter :', snap.size);
  if (!snap.size) return;
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const doc of snap.docs) {
      const c = doc.data();
      await doc.ref.update({ st: 'analyse', ats: Date.now() });
      const ctx = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      let rapport;
      try { rapport = await analyse(page, c.link, c.dossier || {}); }
      catch (er) { rapport = { erreur: String(er.message || er).slice(0, 300), ts: Date.now() }; }
      finally { await ctx.close(); }
      await doc.ref.update({ st: 'traite', rapport, tts: Date.now() });
      console.log(doc.ref.path, JSON.stringify(rapport));
    }
  } finally { await browser.close(); }
}

module.exports = { analyse, LABEL_RULES };
if (require.main === module) main().catch(er => { console.error(er); process.exit(1); });
