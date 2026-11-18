// Diagnostic : le site en ligne affiche-t-il les boutons retour ? (iPhone simulé, sans compte)
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'fr-FR' }); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200))); pg.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) });
  await pg.goto('https://amourdvine-alt.github.io/luisart/?diag=' + Date.now(), { waitUntil: 'load', timeout: 60000 }); await pg.waitForTimeout(6000);
  await pg.evaluate(() => { try { localStorage.setItem('luisart_seen', '1') } catch (e) {} const l = document.getElementById('lx'); if (l) l.remove(); try { started = true } catch (e) {} });
  for (const [vw, a] of [['fhub', null], ['flist', 'other'], ['mycerts', null], ['form', null], ['info', 'cgu'], ['expos', null]]) {
    const r = await pg.evaluate(([vw, a]) => { try { v = vw; arg = a; render(); } catch (e) { return 'ERR ' + e.message }
      const bk = document.querySelector('#app .back, #app .exbk'); if (!bk) return 'aucun bouton retour';
      const cs = getComputedStyle(bk), r = bk.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { display: cs.display, vis: cs.visibility, op: cs.opacity, color: cs.color, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), dessus: top ? (top === bk || bk.contains(top) ? 'le bouton' : top.tagName + '.' + top.className + '#' + top.id) : 'rien', svg: bk.innerHTML.slice(0, 60) } }, [vw, a]);
    console.log(vw, JSON.stringify(r)); await pg.screenshot({ path: `retour-${vw}.png` });
  }
  console.log('version', await pg.evaluate(() => (document.querySelector('meta[name=luisart-v]') || {}).content || document.lastModified));
  console.log('erreurs', JSON.stringify(errs.slice(0, 8))); await b.close();
})();
