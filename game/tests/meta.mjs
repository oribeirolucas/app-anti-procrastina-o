/**
 * Testes das Fases 3 e 4.
 * A camada de rede é exercitada de dentro do browser (mesmo ambiente do jogo)
 * contra o servidor de referência do contrato — não contra um dublê em memória.
 */
import { chromium } from 'playwright';
import { startMockServer } from './mock-server.mjs';

const URL = process.argv[2] ?? 'http://localhost:5180/';
const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? ` — ${info}` : ''}`);
};

const mock = await startMockServer({ flakyFirstRun: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ viewport: { width: 412, height: 892 }, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// Os cenários de 503, 404 e rede fora do ar são PROVOCADOS pelo teste; o
// browser loga cada um. Só erros fora desses casos indicam bug de verdade.
const EXPECTED_NOISE = /503|404|ERR_UNSAFE_PORT|ERR_CONNECTION_REFUSED|Failed to load resource/;
page.on('console', (m) => {
  if (m.type() === 'error' && !EXPECTED_NOISE.test(m.text())) errors.push(m.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('street-emb:tutorial', 'true'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// ---------- FASE 3 ----------
await page.click('#btn-custom');
await page.waitForTimeout(200);
check('F3.1 Personalização abre na aba BOLAS',
  await page.locator('#characters .tab.active').textContent() === 'BOLAS');
const ballCards = await page.locator('.item-card').count();
check('F3.2 Catálogo de bolas', ballCards === 5, `${ballCards} bolas`);

const lockedBall = page.locator('.item-card.locked').first();
check('F3.3 Bola paga aparece bloqueada com preço',
  (await lockedBall.locator('.price').textContent())?.includes('◎'));

// Comprar sem saldo tem que falhar (economia não pode ser furada).
await lockedBall.click();
await page.waitForTimeout(250);
const stillLocked = await page.locator('.item-card.locked').count();
check('F3.4 Compra sem saldo é recusada', stillLocked === ballCards - 1, `${stillLocked} ainda bloqueadas`);

await page.click('#characters .tab[data-tab="scenes"]');
await page.waitForTimeout(150);
const sceneCards = await page.locator('.item-card').count();
check('F3.5 Catálogo de cenários', sceneCards === 3, `${sceneCards} cenários`);

await page.click('#characters .tab[data-tab="characters"]');
await page.waitForTimeout(150);
const charCards = await page.locator('.item-card').count();
const freeChars = await page.locator('.item-card:not(.locked)').count();
check('F3.6 Roster expandido com craques desbloqueáveis',
  charCards === 12 && freeChars === 3, `${charCards} craques, ${freeChars} livres`);

// Desafios
await page.click('#btn-char-back');
await page.click('#btn-challenges');
await page.waitForTimeout(200);
const challengeRows = await page.locator('#challenge-list .list-row').count();
check('F3.7 Três desafios diários', challengeRows === 3);
const dailyIds = await page.evaluate(() => window.game.challenges.today.map((c) => c.def.id));
const dailyTiers = await page.evaluate(() => window.game.challenges.today.map((c) => c.def.tier));
check('F3.8 Um desafio de cada tier', JSON.stringify(dailyTiers) === '[1,2,3]', dailyIds.join(', '));
check('F3.9 Resgate desabilitado sem desafio concluído',
  await page.locator('#btn-claim').isDisabled());

// Loja concede moedas -> destrava a economia
await page.click('#btn-challenges-back');
await page.click('#btn-store');
await page.waitForTimeout(200);
await page.locator('#store-list .list-row button').first().click();
await page.waitForTimeout(400);
const coinsAfterBuy = await page.evaluate(() => window.game.inventory.coins);
check('F4.1 Compra na loja credita moedas', coinsAfterBuy === 1000, `${coinsAfterBuy} moedas`);

await page.click('#btn-store-back');
await page.click('#btn-custom');
await page.waitForTimeout(200);
await page.locator('.item-card.locked').first().click();
await page.waitForTimeout(400);
const unlocked = await page.evaluate(() => ({ coins: window.game.inventory.coins, owned: window.game.inventory.current.owned }));
check('F3.10 Compra com saldo desbloqueia e debita',
  unlocked.owned.length === 1 && unlocked.coins === 700, `${unlocked.owned.join(',')} · ${unlocked.coins} moedas`);

// A bola comprada muda a física de verdade
await page.locator('.item-card:not(.locked)').nth(1).click();
await page.waitForTimeout(200);
const ballEffect = await page.evaluate(() => {
  const g = window.game;
  return { id: g.ball.id, radius: g.ball.radius, impulse: g.ball.impulse, base: 0.135 };
});
check('F3.11 Bola equipada altera a física', ballEffect.radius !== ballEffect.base,
  `${ballEffect.id}: raio ${ballEffect.radius}m, impulso ${ballEffect.impulse}x`);

// Cenário: comprar, equipar e confirmar que chegou ao gerador procedural.
await page.click('#characters .tab[data-tab="scenes"]');
await page.waitForTimeout(150);
const sceneBefore = await page.evaluate(() => window.game.level.activeScene.id);
await page.locator('.item-card.locked').first().click();   // compra ORLA (600)
await page.waitForTimeout(400);
await page.locator('.item-card:not(.locked)').nth(1).click(); // equipa ORLA
await page.waitForTimeout(300);
const sceneAfter = await page.evaluate(() => ({
  id: window.game.level.activeScene.id,
  structure: window.game.level.activeScene.structure,
  coins: window.game.inventory.coins,
}));
check('F3.12 Cenário comprado é equipado e chega ao LevelGenerator',
  sceneBefore === 'rua' && sceneAfter.id === 'orla' && sceneAfter.structure === 'palm',
  `${sceneBefore} → ${sceneAfter.id} (${sceneAfter.structure}), ${sceneAfter.coins} moedas`);

// Props do cenário novo têm que substituir os do antigo.
const propMix = await page.evaluate(() => {
  const kinds = new Set();
  for (const seg of window.game.level.all) for (const p of seg.props) kinds.add(p.kind);
  return [...kinds];
});
check('F3.13 Geração procedural usa os props do cenário',
  propMix.includes('palm') && !propMix.includes('building'), propMix.join(', '));

// ---------- Partida completa com meta-jogo ----------
await page.click('#btn-char-play');
await page.waitForTimeout(300);
const before = await page.evaluate(() => window.game.inventory.coins);
await page.evaluate(() => new Promise((res) => {
  const g = window.game, c = document.querySelector('#stage');
  const r = c.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.7;
  const t0 = performance.now();
  const tick = () => {
    if (g.state !== 'playing') return res();
    const err = g.ballController.timingErrorNow();
    if (g.ballController.canReach(g.player.x) && err >= -0.012) {
      const o = { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: cx, clientY: cy };
      c.dispatchEvent(new PointerEvent('pointerdown', o));
      const off = g.ballController.state.x;
      if (Math.abs(off) > 0.3) c.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: cx + (off > 0 ? -90 : 90) }));
      c.dispatchEvent(new PointerEvent('pointerup', o));
    }
    if (performance.now() - t0 > 25000 || g.player.distance > 120) return res();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
await page.waitForFunction(() => window.game.state === 'gameover', null, { timeout: 20000 });
await page.waitForTimeout(600);
const after = await page.evaluate(() => window.game.inventory.coins);
check('F4.2 Tentativa rende moedas', after > before, `${before} → ${after}`);
check('F4.3 Recompensa aparece no Game Over',
  (await page.locator('#go-extra .reward-row').count()) === 1,
  (await page.locator('#go-extra .reward-row').textContent()) ?? '');

const progressed = await page.evaluate(() => window.game.challenges.today.some((c) => c.progress.best > 0));
check('F3.14 Desafios avançam com a tentativa', progressed);

// Ranking local
await page.click('#btn-go-menu');
await page.click('#btn-ranking');
await page.waitForTimeout(500);
const rankRows = await page.locator('#ranking-list .list-row').count();
check('F4.4 Ranking lista a tentativa', rankRows >= 1, `${rankRows} linhas`);
check('F4.5 Ranking declara a origem dos dados',
  ((await page.locator('#ranking-source').textContent()) ?? '').includes('local'));

// Duelo assíncrono
const duel = await page.evaluate(async () => {
  const g = window.game;
  const { code } = await g.api.publishDuel(g.lastRun);
  const rival = await g.api.getDuel(code.toLowerCase());
  return { code, found: !!rival, sameScore: rival?.score === g.lastRun.score };
});
check('F4.6 Duelo assíncrono publica e recupera pelo código',
  duel.found && duel.sameScore && duel.code.length === 6, `código ${duel.code}`);

// ---------- Contrato HTTP ----------
const http = await page.evaluate(async (baseUrl) => {
  const { HttpGameApi } = await import('/src/net/HttpGameApi.ts');
  const api = new HttpGameApi({ baseUrl, retries: 2, timeoutMs: 5000 });
  const profile = await api.getProfile();
  const patched = await api.updateProfile({ nickname: 'TESTE' });
  const run = {
    runId: 'r1', playerId: profile.id, nickname: profile.nickname, characterId: 'maestro',
    ballId: 'street', sceneId: 'rua', distance: 321, score: 9876, touches: 80,
    perfects: 70, bestCombo: 60, accuracy: 0.9, playedAt: new Date().toISOString(),
  };
  const submitted = await api.submitRun(run); // primeiro POST devolve 503 -> retry
  const board = await api.getLeaderboard('daily', 10);
  const events = await api.getEvents();
  const { code } = await api.publishDuel(run);
  const fetched = await api.getDuel(code);
  const missing = await api.getDuel('ZZZZZZ');
  return {
    profileId: profile.id, nickname: patched.nickname, accepted: submitted.accepted,
    rank: submitted.rank, boardTop: board[0]?.score, eventTitle: events[0]?.title,
    duelOk: fetched?.runId === 'r1', missingIsNull: missing === null,
  };
}, mock.url);

check('F4.7 HttpGameApi cumpre o contrato REST',
  http.profileId === 'srv-player-1' && http.nickname === 'TESTE' && http.accepted &&
  http.boardTop === 9876 && http.eventTitle === 'EVENTO DO SERVIDOR' && http.duelOk,
  `perfil ${http.profileId}, rank ${http.rank}, topo ${http.boardTop}`);
check('F4.8 Retry cobre 503 transitório', mock.state.runAttempts === 2, `${mock.state.runAttempts} tentativas de POST /v1/runs`);
check('F4.9 404 vira null, não exceção', http.missingIsNull);

// SyncQueue: run enfileirada sobrevive à rede fora do ar
const sync = await page.evaluate(async (baseUrl) => {
  const [{ HttpGameApi }, { SyncQueue }, { LocalStorageAdapter }] = await Promise.all([
    import('/src/net/HttpGameApi.ts'),
    import('/src/net/SyncQueue.ts'),
    import('/src/systems/SaveManager.ts'),
  ]);
  const storage = new LocalStorageAdapter('sync-test:');
  const offline = new SyncQueue(storage, new HttpGameApi({ baseUrl: 'http://127.0.0.1:1/', retries: 0, timeoutMs: 300 }));
  const run = {
    runId: 'queued-1', playerId: 'p', nickname: 'N', characterId: 'maestro', ballId: 'street',
    sceneId: 'rua', distance: 10, score: 20, touches: 3, perfects: 1, bestCombo: 1,
    accuracy: 1, playedAt: new Date().toISOString(),
  };
  offline.enqueueRun(run);
  await new Promise((r) => setTimeout(r, 700));
  const persisted = JSON.parse(localStorage.getItem('sync-test:sync-queue') ?? '[]');
  // Rede volta: uma nova fila lê o que ficou no disco e entrega.
  const online = new SyncQueue(storage, new HttpGameApi({ baseUrl, retries: 1, timeoutMs: 3000 }));
  const flushed = await online.flush();
  return { queuedWhileOffline: persisted.length, sent: flushed.sent, remaining: flushed.remaining };
}, mock.url);

check('F4.10 Tentativa offline é persistida na fila', sync.queuedWhileOffline === 1, `${sync.queuedWhileOffline} na fila`);
check('F4.11 Fila é entregue quando a rede volta',
  sync.sent === 1 && sync.remaining === 0, `enviadas ${sync.sent}, restantes ${sync.remaining}`);
check('Sem erros de runtime no console', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
mock.server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks OK`);
process.exit(failed.length ? 1 : 0);
