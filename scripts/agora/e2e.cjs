// Essai réel : un « artiste » et un « spectateur » simulés rejoignent un live Agora de test,
// avec des laissez-passer fabriqués comme ceux du robot. Rien n'est enregistré.
'use strict';
const { chromium } = require('playwright');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const SDK = process.argv[2];
(async () => {
  const appId = (process.env.AGORA_APP_ID || '').trim(), cert = (process.env.AGORA_APP_CERT || '').trim();
  if (!appId || !cert) { console.log('secrets absents'); return; }
  const ch = 'diag_e2e_' + Date.now().toString(36);
  const tH = RtcTokenBuilder.buildTokenWithUid(appId, cert, ch, 1111, RtcRole.PUBLISHER, 600, 600);
  const tV = RtcTokenBuilder.buildTokenWithUid(appId, cert, ch, 0, RtcRole.SUBSCRIBER, 600, 600);
  const tG = RtcTokenBuilder.buildTokenWithUid(appId, cert, ch, 0, RtcRole.PUBLISHER, 600, 600);
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const mk = async () => { const p = await (await b.newContext({ permissions: ['camera', 'microphone'] })).newPage(); p.on('pageerror', e => console.log('  erreur page', String(e).slice(0, 160))); await p.goto('https://example.com/'); await p.addScriptTag(/^https?:/.test(SDK) ? { url: SDK } : { path: SDK }); await p.evaluate(() => { try { AgoraRTC.setLogLevel(3) } catch (e) { } }); return p; };
  const host = await mk(), view = await mk();
  const t0 = Date.now();
  const rh = await host.evaluate(async ({ appId, ch, tH }) => { try { const c = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' }); await c.setClientRole('host'); await c.join(appId, ch, tH, 1111); const [a, v] = await AgoraRTC.createMicrophoneAndCameraTracks(); await c.publish([a, v]); window.c = c; return 'diffuse' } catch (e) { return 'ÉCHEC ' + (e.code || '') + ' ' + String(e.message || e).slice(0, 160) } }, { appId, ch, tH });
  console.log('artiste :', rh, '(' + (Date.now() - t0) + ' ms)');
  const t1 = Date.now();
  const rv = await view.evaluate(async ({ appId, ch, tV, tG }) => { try { const c = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' }); await c.setClientRole('audience', { level: 1 }); const got = new Promise(ok => c.on('user-published', async (u, mt) => { if (mt === 'video') { await c.subscribe(u, mt); ok('vidéo reçue de ' + u.uid) } })); await c.join(appId, ch, tV, 2222); const r = await Promise.race([got, new Promise(z => setTimeout(() => z('rien reçu en 20 s'), 20000))]);
      let g = ''; try { await c.renewToken(tG); await c.setClientRole('host'); const a = await AgoraRTC.createMicrophoneAudioTrack(); await c.publish([a]); g = ' | monté sur scène : oui' } catch (e) { g = ' | monté sur scène : ÉCHEC ' + (e.code || '') + ' ' + String(e.message || e).slice(0, 120) }
      return r + g } catch (e) { return 'ÉCHEC ' + (e.code || '') + ' ' + String(e.message || e).slice(0, 160) } }, { appId, ch, tV, tG });
  console.log('spectateur :', rv, '(' + (Date.now() - t1) + ' ms)');
  const bad = await view.evaluate(async ({ appId, ch }) => { try { const c = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' }); await c.join(appId, ch, null, 3333); return 'ENTRÉ SANS JETON (anormal)' } catch (e) { return 'refusé sans jeton (normal) : ' + (e.code || '') } }, { appId, ch });
  console.log('sécurité :', bad);
  await b.close();
})().catch(e => { console.error('ÉCHEC', e.message); process.exit(1); });
