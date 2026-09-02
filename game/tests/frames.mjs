import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true, deviceScaleFactor: 2 });
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('street-emb:tutorial', 'true'));
await page.reload({ waitUntil: 'networkidle' });
await page.click('#btn-play');
await page.waitForTimeout(200);
// Congela em fases específicas do arco para inspecionar legibilidade.
for (const [name, cond] of [['apex', 'g.ballController.state.vy <= 0 && g.ballController.state.y > 1.3'], ['contato', 'Math.abs(g.ballController.timingErrorNow()) < 0.02']]) {
  await page.evaluate(([c]) => new Promise((res) => {
    const g = window.game, cv = document.querySelector('#stage');
    const r = cv.getBoundingClientRect(), cx = r.left + r.width/2, cy = r.top + r.height*0.7;
    const test = new Function('g', `return ${c}`);
    const tick = () => {
      if (g.state !== 'playing') return res();
      if (g.player.distance > 40 && test(g)) { g.state = 'paused'; return res(); }
      const err = g.ballController.timingErrorNow();
      if (g.ballController.canReach(g.player.x) && err >= -0.012) {
        const o = { pointerId:1, pointerType:'touch', isPrimary:true, bubbles:true, clientX:cx, clientY:cy };
        cv.dispatchEvent(new PointerEvent('pointerdown', o));
        const off = g.ballController.state.x;
        if (Math.abs(off) > 0.3) cv.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: cx + (off>0?-90:90) }));
        cv.dispatchEvent(new PointerEvent('pointerup', o));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), [cond]);
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${process.argv[2]}/frame-${name}.png` });
  await page.evaluate(() => { window.game.state = 'playing'; });
}
await browser.close(); console.log('frames ok');
