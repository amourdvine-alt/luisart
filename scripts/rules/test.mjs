/* Luisart · tests des règles de sécurité Firestore (émulateur).
   Lancés par le robot avant chaque publication des règles : si un test échoue, rien n'est publié. */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import fs from 'node:fs';

const env = await initializeTestEnvironment({ projectId: 'luisart-essai', firestore: { rules: fs.readFileSync(process.env.RULES || 'firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 } });
const now = Date.now();
await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  await setDoc(doc(d, 'cfg/site'), { memm: 'man', roles: false });
  await setDoc(doc(d, 'artists/alice'), { name: 'Alice', mem: 'ok', role: '' });                      // membre gratuit
  await setDoc(doc(d, 'artists/paul'), { name: 'Paul', mem: 'ok', role: '', pro: true, proUntil: 0 }); // membre Pro
  await setDoc(doc(d, 'artists/exp'), { name: 'Exp', mem: 'ok', pro: true, proUntil: now - 1000 });    // Pro expiré
  await setDoc(doc(d, 'artists/att'), { name: 'Att', mem: 'att' });                                    // en attente
  await setDoc(doc(d, 'works/wa'), { aid: 'alice', title: 'A', at: 0 });
  await setDoc(doc(d, 'works/wp'), { aid: 'paul', title: 'P', at: 0, pend: true });
  await setDoc(doc(d, 'certs/wp'), { aid: 'paul', num: 'CA-1', ts: 1 });
  await setDoc(doc(d, 'dm/m1'), { from: 'alice', to: 'paul', text: 'Bonjour', of: { amt: 50000, wid: 'wa', st: 'att' } });
  await setDoc(doc(d, 'orders/o1'), { buyer: 'paul', seller: 'alice', total: 100, items: [{ wid: 'wa' }], num: 'L-1', ts: 1, status: 'attente' });
  await setDoc(doc(d, 'data/users/alice/kyc'), { pn: 'CI123' });
  await setDoc(doc(d, 'data/users/alice/kyc_kid'), { img: 'data:…' });
});
const U = (id, tok) => env.authenticatedContext(id, tok || { firebase: { sign_in_provider: 'google.com' } }).firestore();
const alice = U('alice'), paul = U('paul'), exp = U('exp'), att = U('att'), inconnu = U('zed', { firebase: { sign_in_provider: 'anonymous' } });
const admin = U('adm', { email: 'amourdvine@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } });
const fauxAdmin = U('faux', { email: 'amourdvine@gmail.com', email_verified: false, firebase: { sign_in_provider: 'password' } });
const anonyme = env.unauthenticatedContext().firestore();

let ok = 0, ko = 0;
const t = async (nom, p) => { try { await p; ok++; console.log('OK   ' + nom); } catch (e) { ko++; console.log('ÉCHEC ' + nom + ' — ' + String(e.message || e).slice(0, 140)); } };
const oui = assertSucceeds, non = assertFails;

// Profils : champs réservés
await t('membre : ne peut pas se donner le Pro', non(updateDoc(doc(alice, 'artists/alice'), { pro: true })));
await t('membre : ne peut pas se certifier', non(updateDoc(doc(alice, 'artists/alice'), { cert: true })));
await t('membre : ne peut pas se donner un rôle d’équipe', non(updateDoc(doc(alice, 'artists/alice'), { adm: 'assoc' })));
await t('membre : modifie sa biographie', oui(updateDoc(doc(alice, 'artists/alice'), { bio: 'Peintre' })));
await t('membre : ne modifie pas le profil d’un autre', non(updateDoc(doc(alice, 'artists/paul'), { bio: 'x' })));
await t('nouveau compte : ne se crée pas « confirmé » (mode manuel)', non(setDoc(doc(inconnu, 'artists/zed'), { name: 'Z', mem: 'ok' })));
await t('nouveau compte : se crée « en attente »', oui(setDoc(doc(inconnu, 'artists/zed'), { name: 'Z', mem: 'att' })));
await t('faux administrateur (e-mail non vérifié) : refusé', non(updateDoc(doc(fauxAdmin, 'artists/alice'), { pro: true })));
await t('administrateur : active le Pro', oui(updateDoc(doc(admin, 'artists/alice'), { warn: 0 })));
// Œuvres
await t('membre : publie une œuvre', oui(setDoc(doc(alice, 'works/w2'), { aid: 'alice', title: 'T', at: 0 })));
await t('compte en attente : publication refusée', non(setDoc(doc(att, 'works/w3'), { aid: 'att', title: 'T', at: 0 })));
await t('visiteur anonyme : publication refusée', non(setDoc(doc(inconnu, 'works/w4'), { aid: 'zed', title: 'T' })));
await t('compte gratuit : programmer une œuvre refusé', non(setDoc(doc(alice, 'works/w5'), { aid: 'alice', title: 'T', at: now + 9e6 })));
await t('compte Pro : programmer une œuvre', oui(setDoc(doc(paul, 'works/w6'), { aid: 'paul', title: 'T', at: now + 9e6 })));
await t('Pro expiré : programmer refusé', non(setDoc(doc(exp, 'works/w7'), { aid: 'exp', title: 'T', at: now + 9e6 })));
await t('compte gratuit : programmer en modifiant refusé', non(updateDoc(doc(alice, 'works/wa'), { at: now + 9e6 })));
await t('auteur : modifie son titre', oui(updateDoc(doc(alice, 'works/wa'), { title: 'A2' })));
await t('auteur : lever sa mise en attente refusé', non(updateDoc(doc(paul, 'works/wp'), { pend: false })));
await t('autre membre : modifier l’œuvre refusé', non(updateDoc(doc(paul, 'works/wa'), { title: 'Pirate' })));
await t('publier au nom d’un autre refusé', non(setDoc(doc(alice, 'works/w8'), { aid: 'paul', title: 'T' })));
// Certificats
await t('compte gratuit : créer un certificat refusé', non(setDoc(doc(alice, 'certs/wa'), { aid: 'alice', num: 'CA-9', ts: 1 })));
await t('compte Pro : certificat pour sa propre œuvre', oui(setDoc(doc(paul, 'certs/w6'), { aid: 'paul', num: 'CA-2', ts: 1 })));
await t('compte Pro : certificat pour l’œuvre d’un autre refusé', non(setDoc(doc(paul, 'certs/wa'), { aid: 'paul', num: 'CA-3', ts: 1 })));
await t('compte Pro : changer le numéro du certificat refusé', non(updateDoc(doc(paul, 'certs/wp'), { num: 'CA-999' })));
await t('compte Pro : révoquer ou rétablir soi-même refusé', non(updateDoc(doc(paul, 'certs/wp'), { rev: false })));
await t('tout le monde : lire un certificat', oui(getDoc(doc(anonyme, 'certs/wp'))));
// Messages et offres
await t('membre : envoie un message', oui(setDoc(doc(alice, 'dm/m2'), { from: 'alice', to: 'paul', text: 'Salut' })));
await t('visiteur anonyme : message refusé', non(setDoc(doc(inconnu, 'dm/m3'), { from: 'zed', to: 'paul', text: 'Spam' })));
await t('écrire au nom d’un autre refusé', non(setDoc(doc(alice, 'dm/m4'), { from: 'paul', to: 'alice', text: 'x' })));
await t('destinataire : réécrire le message refusé', non(updateDoc(doc(paul, 'dm/m1'), { text: 'Faux' })));
await t('destinataire : baisser le prix de l’offre refusé', non(updateDoc(doc(paul, 'dm/m1'), { of: { amt: 1, wid: 'wa', st: 'ok' } })));
await t('destinataire : accepter l’offre', oui(updateDoc(doc(paul, 'dm/m1'), { of: { amt: 50000, wid: 'wa', st: 'ok' } })));
await t('expéditeur : changer le prix après acceptation refusé', non(updateDoc(doc(alice, 'dm/m1'), { of: { amt: 90000, wid: 'wa', st: 'ok' } })));
await t('tiers : lire le message refusé', non(getDoc(doc(exp, 'dm/m1'))));
// Commandes
await t('acheteur : changer le contenu de la commande refusé', non(updateDoc(doc(paul, 'orders/o1'), { items: [] })));
await t('acheteur : changer le montant refusé', non(updateDoc(doc(paul, 'orders/o1'), { total: 1 })));
await t('vendeur : changer le statut', oui(updateDoc(doc(alice, 'orders/o1'), { status: 'payee' })));
await t('tiers : lire la commande refusé', non(getDoc(doc(exp, 'orders/o1'))));
// Dossier Pro privé
await t('membre : lit son dossier privé', oui(getDoc(doc(alice, 'data/users/alice/kyc'))));
await t('autre membre : lire le dossier refusé', non(getDoc(doc(paul, 'data/users/alice/kyc'))));
await t('autre membre : lire la pièce d’identité refusé', non(getDoc(doc(paul, 'data/users/alice/kyc_kid'))));
await t('visiteur : lire la pièce d’identité refusé', non(getDoc(doc(anonyme, 'data/users/alice/kyc_kid'))));
await t('administrateur : lit le dossier', oui(getDoc(doc(admin, 'data/users/alice/kyc_kid'))));
await t('administrateur : supprime la pièce d’identité', oui(deleteDoc(doc(admin, 'data/users/alice/kyc_kid'))));
await t('demande Pro : sans donnée d’identité', oui(setDoc(doc(alice, 'proreq/pro_alice'), { uid: 'alice', k: 'pro', st: 'att', ts: now, ty: 'art', pl: 'm', dos: 1 })));
await t('demande Pro : avec numéro de pièce refusée', non(setDoc(doc(paul, 'proreq/pro_paul'), { uid: 'paul', k: 'pro', st: 'att', pn: 'CI1' })));
await t('demande Pro : se l’accorder soi-même refusé', non(updateDoc(doc(alice, 'proreq/pro_alice'), { st: 'ok' })));
// Paiements et réglages
await t('membre : enregistrer un paiement refusé', non(setDoc(doc(alice, 'pay/p1'), { uid: 'alice', amt: 3000 })));
await t('membre : modifier les réglages refusé', non(setDoc(doc(alice, 'cfg/pro'), { pmn: 1 })));
await t('membre : écrire les laissez-passer du live refusé', non(setDoc(doc(alice, 'cfg/agv'), { t: {} })));
await t('tout le monde : lire les réglages', oui(getDoc(doc(anonyme, 'cfg/site'))));
await t('collection inconnue : refusée', non(setDoc(doc(alice, 'autre/x'), { a: 1 })));

await env.cleanup();
console.log(`\n${ok} réussis, ${ko} échoués`);
process.exit(ko ? 1 : 0);
