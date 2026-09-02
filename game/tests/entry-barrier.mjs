/**
 * Prova de construção da barreira de entrada.
 *
 * Não usa estatística: mede o caso extremo e determinístico — um jogador que
 * NUNCA toca na tela. Antes da calibração ele morria em ~6,4m (o número que
 * apareceu 8 vezes no playtest humano). Depois, a rede de segurança vale até
 * o primeiro contato, então ele não pode morrer sem ter jogado.
 *
 * Também mede o instante do primeiro contato possível: é o tempo que o jogador
 * tem para ler o anel na primeira vez que vê o jogo.
 */
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5180/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('street-emb:tutorial', 'true'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.click('#btn-play');
await page.waitForTimeout(200);

const r = await page.evaluate(() => new Promise((resolve) => {
  const g = window.game;
  const t0 = performance.now();
  let firstReachable = null;   // quando o pé alcança a bola pela primeira vez
  let firstIdeal = null;       // quando o instante ideal de contato chega
  const tick = () => {
    const elapsed = (performance.now() - t0) / 1000;
    if (firstReachable === null && g.ballController.canReach(g.player.x)) firstReachable = elapsed;
    if (firstIdeal === null && g.ballController.timingErrorNow() >= 0) firstIdeal = elapsed;
    if (g.state !== 'playing') {
      return resolve({ died: true, distance: g.player.distance, seconds: elapsed, firstReachable, firstIdeal });
    }
    // 20s sem tocar é prova suficiente: o jogador que não joga não perde.
    if (elapsed > 20) return resolve({ died: false, distance: g.player.distance, seconds: elapsed, firstReachable, firstIdeal });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
await browser.close();

const ok = r.died === false;
console.log(`${ok ? 'PASS' : 'FAIL'}  Quem não toca na tela não perde antes de jogar`);
console.log(`      morreu: ${r.died} · distância ${r.distance.toFixed(1)}m em ${r.seconds.toFixed(1)}s`);
console.log(`      1º contato possível: ${r.firstReachable?.toFixed(2) ?? '—'}s · instante ideal: ${r.firstIdeal?.toFixed(2) ?? '—'}s`);
process.exit(ok ? 0 : 1);
