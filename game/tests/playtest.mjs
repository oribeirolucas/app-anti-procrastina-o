/**
 * Playtest automatizado: um "bot" joga a partida usando a mesma API pública do
 * jogo (nenhum atalho interno de física) e valida os critérios de aceite do MVP.
 */
import { chromium } from 'playwright';

const URL = process.argv[2] ?? 'http://localhost:5180/';
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ` — ${info}` : ''}`);
};

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// 1. Abrir o jogo
check('1. Jogo abre no menu', await page.isVisible('#menu'));

// 2. Escolher um personagem
await page.click('#btn-characters');
await page.waitForTimeout(150);
const cards = await page.locator('.char-card').count();
check('2. Seleção de personagem lista craques', cards === 12, `${cards} cards`);
// Escolhe um craque desbloqueado — os pagos são exercitados em tests/meta.mjs.
const free = page.locator('.char-card:not(.locked)').nth(1);
await free.click();
check('2b. Personagem fica selecionado', await free.evaluate((n) => n.classList.contains('selected')));

// 3. Iniciar partida (passando pelo tutorial na primeira vez)
await page.click('#btn-char-play');
await page.waitForTimeout(150);
if (await page.isVisible('#tutorial')) {
  check('17. Tutorial aparece na primeira partida', true);
  await page.click('#btn-tut-start');
}
await page.waitForTimeout(300);
check('3. Partida inicia com HUD visível', await page.isVisible('#hud'));

const readState = () => page.evaluate(() => {
  const g = window.game;
  return {
    state: g.state,
    dist: g.player.distance,
    ballY: g.ballController.state.y,
    ballX: g.ballController.state.x,
    playerX: g.player.x,
    err: g.ballController.timingErrorNow(),
    reach: g.ballController.canReach(g.player.x),
    score: g.score.total,
    streak: g.combo.current,
    mult: g.combo.multiplier,
    touches: g.score.touchCount,
    tier: g.difficulty.tier.label,
    props: g.level.all.reduce((a, s) => a + s.props.length, 0),
    solids: g.level.all.reduce((a, s) => a + s.props.filter((p) => p.solid).length, 0),
  };
});

const s0 = await readState();
await page.waitForTimeout(700);
const s1 = await readState();
check('4. Craque caminha automaticamente', s1.dist > s0.dist + 1, `${s1.dist.toFixed(1)}m`);

/**
 * Bot: espera o anel de timing fechar e dá o tap na janela PERFECT.
 * Usa só o input público (dispatch de pointer events reais).
 */
const tap = () => page.dispatchEvent('#stage', 'pointerdown', { pointerId: 1, clientX: 200, clientY: 600, pointerType: 'touch', isPrimary: true })
  .then(() => page.dispatchEvent('#stage', 'pointerup', { pointerId: 1, clientX: 200, clientY: 600, pointerType: 'touch', isPrimary: true }));

/**
 * Bot dentro da página: roda no mesmo rAF do jogo e dispara PointerEvents reais
 * no canvas — exercita InputController -> BallController como um dedo humano.
 * (Rodar o bot por page.evaluate daria ~20ms de latência por poll, o que é maior
 * que a própria janela de PERFECT — mediria a rede, não o jogo.)
 */
const play = await page.evaluate(({ durationMs, targetStreak }) => new Promise((resolve) => {
  const g = window.game;
  const canvas = document.querySelector('#stage');
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height * 0.7;
  const tap = () => {
    const opts = { pointerId: 1, clientX: cx, clientY: cy, pointerType: 'touch', isPrimary: true, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
    canvas.dispatchEvent(new PointerEvent('pointerup', opts));
  };
  const swipe = (dir) => {
    const base = { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, clientX: cx, clientY: cy }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...base, clientX: cx + dir * 90, clientY: cy }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...base, clientX: cx + dir * 90, clientY: cy }));
  };
  const t0 = performance.now();
  let taps = 0, maxStreak = 0, minBallY = 99, frames = 0;
  const tick = () => {
    frames++;
    if (g.state !== 'playing') return resolve({ taps, maxStreak, minBallY, ended: true, frames, ms: performance.now() - t0 });
    const err = g.ballController.timingErrorNow();
    // Toca assim que o instante ideal chega (err >= 0 = agora ou levemente tarde).
    // Um bot que só aceitasse |err| <= 0.02 dependeria do framerate do runner,
    // não da mecânica.
    if (g.ballController.canReach(g.player.x) && err >= -0.012) {
      // Jogador competente: corrige a trajetória com swipe quando a bola foge
      // do eixo, em vez de só martelar tap.
      const off = g.ballController.state.x;
      if (Math.abs(off) > 0.3) swipe(off > 0 ? -1 : 1);
      else tap();
      taps++;
    }
    maxStreak = Math.max(maxStreak, g.combo.current);
    minBallY = Math.min(minBallY, g.ballController.state.y);
    if (performance.now() - t0 > durationMs || g.combo.current >= targetStreak) {
      return resolve({ taps, maxStreak, minBallY, ended: false, frames, ms: performance.now() - t0 });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}), { durationMs: 40000, targetStreak: 60 });

const s2 = await readState();
check('5/6/7. Embaixadinhas mantêm a bola no ar', s2.state === 'playing' && s2.touches > 20, `${s2.touches} toques em ${(play.ms / 1000).toFixed(1)}s, bola em ${s2.ballY.toFixed(2)}m`);
check('8. Distância percorrida cresce', s2.dist > 60, `${s2.dist.toFixed(0)}m`);
check('9. Combo aumenta', play.maxStreak >= 25, `sequência ${play.maxStreak}`);
check('10. Pontuação aumenta', s2.score > 500, `${s2.score} pts`);
check('9b. Multiplicador sobe em degraus', s2.mult >= 3, `x${s2.mult}`);
check('11. Cenário procedural com obstáculos', s2.props > 20, `${s2.props} props, ${s2.solids} obstáculos`);
check('18. Progressão de dificuldade', s2.dist < 100 || s2.tier !== 'AQUECIMENTO', `tier ${s2.tier} @ ${s2.dist.toFixed(0)}m`);

// 12/13. Deixar a bola cair -> Game Over
await page.waitForTimeout(2500);
const s3 = await readState();
check('12/13. Bola no chão gera Game Over', s3.state === 'gameover');
check('14. Tela de resultado com estatísticas', await page.isVisible('#gameover') && (await page.locator('.go-row').count()) >= 6);

// 15. Recorde salvo
const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('street-emb:records') ?? 'null'));
check('15. Recorde salvo localmente', !!rec && rec.bestDistance > 60 && rec.totalRuns === 1, JSON.stringify(rec));

// 16/17. Restart instantâneo
const t0 = Date.now();
await page.click('#btn-retry');
await page.waitForFunction(() => window.game.state === 'playing', null, { timeout: 3000 });
const restartMs = Date.now() - t0;
const s4 = await readState();
check('16/17. "Tentar novamente" volta direto ao jogo', s4.state === 'playing' && s4.dist < 5, `${restartMs}ms`);

// Performance: mede o frame time real durante a partida.
// Performance: o runner é headless sem GPU, então o número absoluto de fps não
// representa um celular. O que importa é não haver frame longo (stall/GC).
const perf = await page.evaluate(() => new Promise((res) => {
  const times = []; let last = performance.now(); const start = last;
  const tick = () => {
    const now = performance.now();
    times.push(now - last); last = now;
    if (now - start < 3000) requestAnimationFrame(tick);
    else {
      times.sort((a, b) => a - b);
      res({ fps: times.length / ((now - start) / 1000), p50: times[Math.floor(times.length * 0.5)], p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1] });
    }
  };
  requestAnimationFrame(tick);
}));
check('18b. Frame time sem picos', perf.p95 < 40 && perf.max < 90, `p50 ${perf.p50.toFixed(1)}ms · p95 ${perf.p95.toFixed(1)}ms · max ${perf.max.toFixed(1)}ms · ${perf.fps.toFixed(0)}fps (headless, sem GPU)`);
check('Sem erros de runtime no console', errors.length === 0, errors.slice(0, 3).join(' | '));

// Determinismo (§3): a mesma sequência de toques tem que produzir exatamente a
// mesma trajetória. Se a física fosse aleatória, o jogador perderia sem culpa.
const determinism = await page.evaluate(() => {
  const run = () => {
    const { BallController } = window.__test;
    const ch = window.game.activeCharacter;
    const ball = new BallController(ch);
    ball.reset(ch);
    ball.state.vy = 6.0;
    const trace = [];
    for (let i = 0; i < 4000; i++) {
      ball.update(1 / 120);
      if (i % 60 === 0) ball.touch({ gesture: i % 180 === 0 ? 'up' : 'tap', power: 0.6 }, ball.state.x - 0.5);
      if (i % 40 === 0) trace.push(`${ball.state.x.toFixed(9)}|${ball.state.y.toFixed(9)}`);
    }
    return trace.join(',');
  };
  const a = run(), b = run();
  return { equal: a === b, len: a.length };
});
check('3b. Física é determinística', determinism.equal, `${determinism.len} amostras idênticas`);

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks OK`);
process.exit(failed.length ? 1 : 0);
