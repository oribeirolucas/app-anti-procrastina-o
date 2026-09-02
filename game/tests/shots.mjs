import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true, deviceScaleFactor: 2 });
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
const out = process.argv[2] ?? '.';
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/01-menu.png` });
await page.click('#btn-characters'); await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/02-personagens.png` });
await page.click('#btn-char-play'); await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/03-tutorial.png` });
await page.click('#btn-tut-start');
await page.evaluate(() => new Promise((res) => {
  const g = window.game, c = document.querySelector('#stage');
  const r = c.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height*0.7;
  const t0 = performance.now();
  const tick = () => {
    if (g.state !== 'playing') return res();
    const err = g.ballController.timingErrorNow();
    if (g.ballController.canReach(g.player.x) && err >= -0.012) {
      const o = { pointerId:1, pointerType:'touch', isPrimary:true, bubbles:true, clientX:cx, clientY:cy };
      const off = g.ballController.state.x;
      c.dispatchEvent(new PointerEvent('pointerdown', o));
      if (Math.abs(off) > 0.3) c.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: cx + (off>0?-90:90) }));
      c.dispatchEvent(new PointerEvent('pointerup', o));
    }
    if (performance.now() - t0 > 22000 || g.player.distance > 190) return res();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
await page.screenshot({ path: `${out}/04-gameplay.png` });
await page.waitForFunction(() => window.game.state === 'gameover', null, { timeout: 15000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/05-gameover.png` });
await browser.close();
console.log('shots ok');
