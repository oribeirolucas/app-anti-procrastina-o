import { chromium } from 'playwright';
const out = process.argv[2] ?? '.';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true, deviceScaleFactor: 2 });
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('street-emb:tutorial', 'true'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
// Credita moedas pela loja para fotografar as telas com conteúdo desbloqueado.
await page.evaluate(async () => {
  await window.game.inventory.grantCoins(9000);
  await window.game.inventory.buy('orla', 600);
  await window.game.inventory.buy('chama', 2600);
});
await page.click('#btn-custom'); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/f3-bolas.png` });
await page.click('#characters .tab[data-tab="scenes"]'); await page.waitForTimeout(200);
await page.locator('.item-card:not(.locked)').nth(1).click(); await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/f3-cenarios.png` });
await page.click('#btn-char-back'); await page.click('#btn-challenges'); await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/f3-desafios.png` });
await page.click('#btn-challenges-back'); await page.click('#btn-store'); await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/f4-loja.png` });
await page.click('#btn-store-back'); await page.click('#btn-play'); await page.waitForTimeout(200);
await page.evaluate(() => new Promise((res) => {
  const g = window.game, c = document.querySelector('#stage');
  const r = c.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height*0.7;
  const t0 = performance.now();
  const tick = () => {
    if (g.state !== 'playing') return res();
    const err = g.ballController.timingErrorNow();
    if (g.ballController.canReach(g.player.x) && err >= -0.012) {
      const o = { pointerId:1, pointerType:'touch', isPrimary:true, bubbles:true, clientX:cx, clientY:cy };
      c.dispatchEvent(new PointerEvent('pointerdown', o));
      const off = g.ballController.state.x;
      if (Math.abs(off) > 0.3) c.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: cx + (off>0?-90:90) }));
      c.dispatchEvent(new PointerEvent('pointerup', o));
    }
    if (performance.now() - t0 > 14000 || g.player.distance > 70) return res();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
await page.screenshot({ path: `${out}/f3-orla-gameplay.png` });
await browser.close(); console.log('ok');
