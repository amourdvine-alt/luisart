// Test local du robot sur une page de formulaire factice (aucune donnée réelle)
const path = require('path');
const { chromium } = require('playwright');
const { analyse } = require('./robot.cjs');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await b.newPage();
  const url = 'file://' + path.join(__dirname, 'fixture-appel.html');
  const r = await analyse(page, url, { name: 'Artiste Test', whatsapp: '+2250700000000', city: 'Bingerville', bio: 'Peintre.' });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
