/**
 * Simula um JOGADOR HUMANO, não o bot perfeito do playtest.
 * O bot do playtest toca no instante exato; um humano tem tempo de reação e
 * dispersão de timing. Este teste mede o que importa de verdade: quanto um
 * jogador real dura, e onde ele morre.
 *
 * `sigma` = desvio-padrão do erro de timing, em segundos.
 *   0.05 = jogador experiente · 0.09 = jogador mediano · 0.14 = primeira vez
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5180/';
const RUNS = Number(process.argv[3] ?? 20);
const OUT = process.argv[4] ?? '/tmp/human-sim.jsonl';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('street-emb:tutorial', 'true'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const profiles = [
  { name: 'novato     ', sigma: 0.14 },
  { name: 'mediano    ', sigma: 0.09 },
  { name: 'experiente ', sigma: 0.05 },
];

const report = [];
for (const p of profiles) {
  const results = await page.evaluate(async ({ sigma, runs }) => {
    const g = window.game;
    const cv = document.querySelector('#stage');
    const r = cv.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.7;
    // Ruído gaussiano (Box-Muller) para o erro de timing.
    const gauss = () => Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());

    const out = [];
    for (let i = 0; i < runs; i++) {
      // Reinicia sempre pelo mesmo caminho do jogador.
      if (g.state !== 'playing') {
        const btn = document.querySelector('#btn-retry');
        (g.state === 'gameover' ? btn : document.querySelector('#btn-play')).click();
        await new Promise((res) => setTimeout(res, 120));
      }
      let target = null;  // instante-alvo escolhido pelo humano para o próximo toque
      const t0 = performance.now();
      await new Promise((resolve) => {
        const tick = () => {
          // Teto por tentativa: um jogador bom pode durar minutos e o objetivo
          // aqui é medir a curva de morte, não maratona.
          if (g.state !== 'playing' || performance.now() - t0 > 12000) {
            if (g.state === 'playing') g.endRun();
            return resolve(out.push({
              distance: g.player.distance, score: g.score.total,
              touches: g.score.touchCount, combo: g.combo.bestStreak,
            }));
          }
          const err = g.ballController.timingErrorNow();
          // O humano "decide" o alvo quando a bola entra na descida, com erro.
          if (target === null && err > -0.5 && err < 0) target = err - gauss() * sigma;
          if (target !== null && err >= target && g.ballController.canReach(g.player.x)) {
            const o = { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: cx, clientY: cy };
            cv.dispatchEvent(new PointerEvent('pointerdown', o));
            const off = g.ballController.state.x;
            // Corrige a trajetória quando percebe a bola fugindo (nem sempre).
            if (Math.abs(off) > 0.45 && Math.random() < 0.7) {
              cv.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: cx + (off > 0 ? -90 : 90) }));
            }
            cv.dispatchEvent(new PointerEvent('pointerup', o));
            target = null;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await new Promise((res) => setTimeout(res, 60));
    }
    return out;
  }, { sigma: p.sigma, runs: RUNS });

  const d = results.map((r) => r.distance).sort((a, b) => a - b);
  const med = d[Math.floor(d.length / 2)];
  const best = d[d.length - 1];
  const deaths6 = results.filter((r) => r.distance < 8).length;
  const zeroTouch = results.filter((r) => r.touches === 0).length;
  const reached100 = results.filter((r) => r.distance >= 100).length;
  const row = { perfil: p.name.trim(), mediana: Math.round(med), melhor: Math.round(best), mortesAte8m: `${deaths6}/${RUNS}`, semUmToque: `${zeroTouch}/${RUNS}`, ate100m: `${reached100}/${RUNS}` };
  report.push(row);
  // Grava por perfil: um travamento no meio não pode custar a medição inteira.
  appendFileSync(OUT, JSON.stringify(row) + '\n');
  console.log('OK ' + JSON.stringify(row));
}
await browser.close();
console.table(report);
