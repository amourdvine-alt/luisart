// Vérifie si un serveur relais (TURN) public et gratuit répond : on demande des adresses relais, rien d'autre.
'use strict';
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage(); await pg.goto('about:blank');
  const sets = {
    'Open Relay (metered.ca) 80': [{ urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }],
    'Open Relay (metered.ca) 443': [{ urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }],
    'Open Relay (metered.ca) 443 tcp': [{ urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }],
    'Open Relay staticauth 80': [{ urls: 'turn:staticauth.openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayprojectsecret' }],
    'freestun.net 3478': [{ urls: 'turn:freestun.net:3478', username: 'free', credential: 'free' }],
  };
  for (const [name, ice] of Object.entries(sets)) {
    const r = await pg.evaluate(async ice => { const pc = new RTCPeerConnection({ iceServers: ice, iceTransportPolicy: 'relay' }); const c = []; let err = ''; pc.onicecandidate = e => { if (e.candidate) c.push(e.candidate.type + '/' + e.candidate.protocol) }; pc.onicecandidateerror = e => { err = e.errorCode + ' ' + (e.errorText || '') }; pc.addTransceiver('audio'); await pc.setLocalDescription(await pc.createOffer()); const t0 = Date.now(); await new Promise(ok => { const t = setTimeout(ok, 9000); pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); ok() } } }); pc.close(); return { n: c.length, types: [...new Set(c)].join(','), ms: Date.now() - t0, err } }, ice);
    console.log('RELAIS', name, '→', r.n ? 'RÉPOND (' + r.n + ' adresses relais, ' + r.types + ', ' + r.ms + ' ms)' : 'ne répond pas' + (r.err ? ' [' + r.err.slice(0, 80) + ']' : ''));
  }
  await b.close();
})().catch(e => { console.error('ÉCHEC', e.message); process.exit(1); });
