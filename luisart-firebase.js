/* Luisart · branchement Firebase
   Remplace les services de l'hébergement claude.ai (claude.use) par Firebase :
   comptes (Auth), base de données (Firestore), fichiers (Storage), téléchargements. */
(function(){
'use strict';
const CFG=window.LUISART_FIREBASE||{};
const FB=CFG.config||{};
const V='10.12.2',BASE='https://www.gstatic.com/firebasejs/'+V+'/';
const OWNERS=(CFG.ownerEmails||[]).map(x=>String(x).toLowerCase());
const load=src=>new Promise((ok,ko)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>ko(new Error('load '+src));document.head.appendChild(s)});
const configured=!!(FB.apiKey&&FB.projectId);
function banner(t){try{const d=document.createElement('div');d.textContent=t;d.style.cssText='position:fixed;left:12px;right:12px;bottom:90px;z-index:9999;background:#7a1f1f;color:#fff;padding:12px 14px;border-radius:14px;font:14px system-ui;box-shadow:0 8px 24px #0005';(document.body||document.documentElement).appendChild(d);setTimeout(()=>d.remove(),9000)}catch(e){}}

const ready=(async()=>{
  if(!configured){banner('Luisart : la configuration Firebase est vide (fichier firebase-config.js).');return null}
  if(!window.firebase||!firebase.firestore){await load(BASE+'firebase-app-compat.js');await Promise.all(['auth','firestore'].concat(FB.storageBucket?['storage']:[]).map(n=>load(BASE+'firebase-'+n+'-compat.js')))}
  if(!firebase.apps.length)firebase.initializeApp(FB);
  const auth=firebase.auth(),fs=firebase.firestore();
  try{fs.settings({ignoreUndefinedProperties:true,merge:true})}catch(e){}
  try{await fs.enablePersistence({synchronizeTabs:true})}catch(e){}
  try{const r=await auth.getRedirectResult();if(r&&r.user)sessionStorage.setItem('lfb_just','1')}catch(e){if(e&&e.code==='auth/credential-already-in-use'&&e.credential){try{await auth.signInWithCredential(e.credential)}catch(x){}}}
  await new Promise(ok=>{const un=auth.onAuthStateChanged(u=>{if(u){un();ok()}else auth.signInAnonymously().catch(er=>{console.warn(er);un();ok()})})});
  let st=null;try{if(FB.storageBucket&&firebase.storage)st=firebase.storage()}catch(e){}
  return {auth,fs,st};
})().catch(e=>{console.error(e);banner('Luisart : connexion au serveur impossible. Vérifiez votre connexion internet.');return null});

const isOwnerU=u=>!!(u&&!u.isAnonymous&&u.email&&u.emailVerified!==false&&OWNERS.includes(u.email.toLowerCase()));
const appId=u=>u?(isOwnerU(u)&&CFG.ownerAppId?CFG.ownerAppId:u.uid):null;

/* ---------- base de données (même interface que claude.use('db')) ---------- */
const nest=o=>{const r={};for(const k of Object.keys(o||{})){const v=o[k];if(k.includes('.')){const ps=k.split('.');let t=r;for(let i=0;i<ps.length-1;i++){t=t[ps[i]]=(t[ps[i]]&&typeof t[ps[i]]==='object')?t[ps[i]]:{}}t[ps[ps.length-1]]=v}else if(v&&typeof v==='object'&&!Array.isArray(v)&&r[k]&&typeof r[k]==='object')Object.assign(r[k],v);else r[k]=v}return r};
const sDoc=s=>({id:s.id,exists:!!s.exists,data:()=>s.exists?s.data():undefined,metadata:s.metadata||{}});
const sQ=q=>{const docs=q.docs.map(sDoc);return {docs,size:docs.length,empty:!docs.length,forEach:f=>docs.forEach(f),docChanges:()=>q.docChanges().map(c=>({type:c.type,doc:sDoc(c.doc),oldIndex:c.oldIndex,newIndex:c.newIndex})),metadata:q.metadata||{}}};
const err=e=>{const c=String(e&&e.code||'').replace(/^firestore\//,'');return Object.assign(new Error(e&&e.message||c),{code:c==='permission-denied'?'not_permitted':c==='not-found'?'not_found':c||'unknown'})};
function mkDb(fs){
  const docRef=p=>{const r=fs.doc(p);return {id:r.id,path:p,
    get:()=>r.get().then(sDoc,e=>{throw err(e)}),
    set:d=>r.set(d).catch(e=>{throw err(e)}),
    update:d=>r.set(nest(d),{merge:true}).catch(e=>{throw err(e)}),
    delete:()=>r.delete().catch(e=>{throw err(e)}),
    onSnapshot:(cb,eb)=>r.onSnapshot(s=>cb(sDoc(s)),e=>eb&&eb(err(e))),
    collection:q=>colRef(fs.collection(p+'/'+q),p+'/'+q)}};
  const colRef=(q,path)=>({path,
    doc:id=>docRef(path+'/'+(id||fs.collection(path).doc().id)),
    add:d=>fs.collection(path).add(d).then(x=>({id:x.id}),e=>{throw err(e)}),
    where:(f,op,v)=>colRef(q.where(f,op,v),path),
    orderBy:(f,d)=>colRef(q.orderBy(f,d||'asc'),path),
    limit:n=>colRef(q.limit(n),path),
    get:()=>q.get().then(sQ,e=>{throw err(e)}),
    onSnapshot:(cb,eb)=>q.onSnapshot(s=>cb(sQ(s)),e=>{console.warn('snapshot',path,e);eb&&eb(err(e))})});
  return Object.freeze({doc:docRef,collection:p=>colRef(fs.collection(p),p)});
}

/* ---------- utilisateur ---------- */
function mkUser(auth){
  const cur=()=>auth.currentUser;
  return Object.freeze({
    id:async()=>appId(cur()),
    isOwner:async()=>isOwnerU(cur()),
    canEdit:async()=>isOwnerU(cur()),
    can:async n=>n==='data.write'?!!cur():isOwnerU(cur()),
    me:async()=>{const u=cur();return {id:appId(u),name:(u&&u.displayName)||'',guest:false}},
    profiles:async ids=>{const o={};(ids||[]).forEach(i=>o[i]={id:i,name:''});return o},
    search:async()=>[]});
}

/* ---------- fichiers ---------- */
function mkAssets(st,auth){
  if(!st)return null;
  return Object.freeze({
    upload:async blob=>{const u=auth.currentUser;if(!u)throw Object.assign(new Error('Connexion requise'),{code:'not_granted'});if(blob.size>20*1048576)throw Object.assign(new Error('Fichier trop lourd'),{code:'too_large'});
      const ext=((blob.type||'').split('/')[1]||'bin').replace(/[^a-z0-9]/gi,'').slice(0,5);const id='u/'+u.uid+'/'+Date.now().toString(36)+Math.random().toString(36).slice(2,8)+'.'+ext;
      const ref=st.ref(id);await ref.put(blob,{contentType:blob.type||'application/octet-stream',cacheControl:'public,max-age=31536000'});const url=await ref.getDownloadURL();return {id,url,sizeBytes:blob.size,contentType:blob.type||''}},
    list:async()=>({assets:[],usage:{}}),
    delete:async id=>{try{await st.ref(id).delete()}catch(e){}}});
}
const downloads=Object.freeze({save:async({filename,data})=>{const b=data instanceof Blob?data:new Blob([data]);const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=filename||'fichier';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(u);a.remove()},4000);return {}}});

let CACHE={};
window.claude=Object.freeze({use:async name=>{
  if(name in CACHE)return CACHE[name];
  const r=await ready;let v=null;
  if(name==='downloads')v=downloads;
  else if(r){if(name==='db')v=mkDb(r.fs);else if(name==='user')v=mkUser(r.auth);else if(name==='assets')v=mkAssets(r.st,r.auth)}
  return CACHE[name]=v}});

/* ---------- connexion Google (retrouver son compte sur tous ses appareils) ---------- */
async function signInGoogle(){const r=await ready;if(!r)return;const auth=r.auth,p=new firebase.auth.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account'});
  const u=auth.currentUser;
  try{if(u&&u.isAnonymous){try{await u.linkWithPopup(p)}catch(e){if(e.code==='auth/credential-already-in-use'&&e.credential){await auth.signInWithCredential(e.credential)}else if(/popup/.test(e.code||'')){return u.linkWithRedirect(p)}else throw e}}
   else{try{await auth.signInWithPopup(p)}catch(e){if(/popup/.test(e.code||''))return auth.signInWithRedirect(p);throw e}}
   location.reload()}catch(e){console.error(e);alert('Connexion Google impossible : '+(e.message||e.code))}}
async function signOut(){const r=await ready;if(!r)return;try{await r.auth.signOut()}catch(e){}}
window.luisartAuth={signInGoogle,signOut,ready,info:async()=>{const r=await ready;const u=r&&r.auth.currentUser;return u?{uid:u.uid,appId:appId(u),email:u.email||'',anonymous:u.isAnonymous,owner:isOwnerU(u)}:null}};

/* carte « Continuer avec Google » sur Profil et Créer mon compte, tant que la personne n'est pas connectée */
const CSS='.lfbg{display:flex;align-items:center;gap:12px;margin:12px 16px;padding:14px 16px;border-radius:18px;background:var(--cd,#fff);border:1px solid var(--bd,#e7dfd0)}.lfbg p{margin:0;flex:1;font-size:13.5px;line-height:1.35}.lfbg b{display:block;font-size:14.5px}.lfbg button{flex:none;display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:22px;border:1px solid var(--bd,#ddd);background:#fff;color:#222;font-weight:600;font-size:14px}';
let anon=true;ready.then(r=>{if(!r)return;r.auth.onAuthStateChanged(u=>{anon=!u||u.isAnonymous})});
function card(){if(!anon)return;const view=(typeof v!=='undefined')?v:'';if(view!=='me'&&view!=='join')return;const app=document.getElementById('app');if(!app||app.querySelector('.lfbg'))return;
  if(!document.getElementById('lfbcss')){const s=document.createElement('style');s.id='lfbcss';s.textContent=CSS;document.head.appendChild(s)}
  const d=document.createElement('div');d.className='lfbg';d.innerHTML='<p><b>Retrouvez votre compte partout</b>Connectez-vous avec Google pour garder vos œuvres et messages sur tous vos appareils.</p><button type="button"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>Google</button>';
  d.querySelector('button').onclick=signInGoogle;app.insertBefore(d,app.firstChild)}
setInterval(card,700);
/* « Se déconnecter » : on ferme aussi la session Google */
document.addEventListener('click',ev=>{if(ev.target.closest&&ev.target.closest('[data-lgo]'))signOut()},true);
})();
