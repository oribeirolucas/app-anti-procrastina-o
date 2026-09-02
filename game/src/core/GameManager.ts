import { CONFIG } from '../data/config';
import { CHARACTERS, getCharacter, type Character } from '../data/characters';
import { BALLS, getBall, type Ball } from '../data/balls';
import { SCENES, getScene, type Scene } from '../data/scenes';
import type { ChallengeDef } from '../data/challenges';
import type { GameState, RunStats } from './types';
import { BallController, type TouchInput } from '../gameplay/BallController';
import { PlayerController } from '../gameplay/PlayerController';
import { InputController } from '../gameplay/InputController';
import { ComboManager } from '../gameplay/ComboManager';
import { ScoreManager } from '../gameplay/ScoreManager';
import { DifficultyManager } from '../gameplay/DifficultyManager';
import { LevelGenerator } from '../gameplay/LevelGenerator';
import { ObstacleManager } from '../gameplay/ObstacleManager';
import { Camera } from '../render/Camera';
import { Renderer } from '../render/Renderer';
import { UIManager } from '../systems/UIManager';
import { SaveManager } from '../systems/SaveManager';
import { AudioManager, vibrate } from '../systems/AudioManager';
import { InventoryManager } from '../systems/InventoryManager';
import { ChallengeManager } from '../systems/ChallengeManager';
import { EventManager } from '../systems/EventManager';
import { StoreManager } from '../systems/StoreManager';
import { createGameApi, SyncQueue, newId, type GameApi, type LeaderboardPeriod, type RunRecord } from '../net';
import type { LoadoutTab } from '../systems/UIManager';

/**
 * Orquestrador. Não implementa regra de jogo nenhuma: apenas conecta os
 * módulos, roda a máquina de estados e o loop com passo fixo (§19).
 */
export class GameManager {
  private state: GameState = 'boot';
  /** Exposto para ferramentas de teste/telemetria; somente leitura. */
  get activeCharacter(): Character { return this.character; }
  private character: Character;
  private ball: Ball;
  private scene: Scene;
  private loadoutTab: LoadoutTab = 'characters';

  private readonly camera = new Camera();
  private readonly renderer: Renderer;
  private readonly level = new LevelGenerator();
  private readonly obstacles = new ObstacleManager();
  private readonly combo = new ComboManager();
  private readonly score = new ScoreManager();
  private readonly difficulty = new DifficultyManager();
  private readonly input = new InputController();
  private readonly save = new SaveManager();
  private readonly audio = new AudioManager();
  private readonly ui: UIManager;
  private readonly player: PlayerController;
  private readonly ballController: BallController;
  private readonly api: GameApi;
  private readonly inventory: InventoryManager;
  private readonly challenges: ChallengeManager;
  private readonly events: EventManager;
  private readonly store: StoreManager;
  private readonly sync: SyncQueue;

  private lastTime = 0;
  private accumulator = 0;
  private runTime = 0;
  private rafId = 0;
  /** Carência inicial: a bola entra em jogo sem punir o jogador. */
  private graceTime = 0;
  /** Última tentativa registrada — base do duelo assíncrono. */
  private lastRun: RunRecord | null = null;
  private completedToday: ChallengeDef[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.character = getCharacter(this.save.selectedCharacter);
    this.ball = getBall(this.save.loadout.ballId);
    this.scene = getScene(this.save.loadout.sceneId);
    this.player = new PlayerController(this.character);
    this.ballController = new BallController(this.character, this.ball);

    const storage = this.save.storageAdapter;
    this.api = createGameApi(storage);
    this.inventory = new InventoryManager(this.api);
    this.challenges = new ChallengeManager(storage);
    this.events = new EventManager(this.api);
    this.store = new StoreManager(this.inventory);
    this.sync = new SyncQueue(storage, this.api);

    this.ui = new UIManager({
      onPlay: () => this.handlePlay(),
      onOpenCharacters: (tab) => this.goToCharacters(tab),
      onSelectCharacter: (id) => this.selectCharacter(id),
      onBackToMenu: () => this.goToMenu(),
      onRetry: () => this.startRun(),
      onTutorialDone: () => { this.save.markTutorialSeen(); this.startRun(); },
      onToggleSound: () => {
        this.audio.setMuted(!this.audio.muted);
        return !this.audio.muted;
      },
      onSelectTab: (tab) => { this.loadoutTab = tab; this.renderLoadout(); },
      onSelectBall: (id) => this.selectBall(id),
      onSelectScene: (id) => this.selectScene(id),
      onBuy: (id, price) => void this.buy(id, price),
      onOpenChallenges: () => this.goToChallenges(),
      onClaimChallenges: () => void this.claimChallenges(),
      onOpenRanking: (period) => void this.goToRanking(period),
      onDuel: () => void this.handleDuel(),
      onOpenStore: () => this.goToStore(),
      onPurchase: (id) => void this.purchase(id),
    });

    this.input.onGesture = (g) => this.handleGesture(g);
    this.input.attach(canvas);

    this.combo.onTierUp = (e) => {
      this.ui.showToast(`COMBO x${e.mult}`);
      this.audio.comboUp();
      vibrate(30);
      this.camera.addShake(0.25);
    };
    this.difficulty.onTierChange = (tier) => {
      this.player.setTargetSpeed(tier.speed);
      this.ballController.driftPerTouch = tier.drift;
      this.ui.showToast(tier.label);
    };

    window.addEventListener('resize', () => this.renderer.resize(this.camera));
    this.renderer.resize(this.camera);
  }

  start(): void {
    this.level.reset(undefined, this.scene);
    this.goToMenu();
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
    // Meta-jogo carrega em paralelo: o menu já é jogável antes disso terminar.
    void this.bootMeta();
  }

  /** Fase 4 — carrega perfil, eventos e reenvia o que ficou preso na fila. */
  private async bootMeta(): Promise<void> {
    try {
      await this.inventory.load();
      this.ui.setCoins(this.inventory.coins);
    } catch {
      // Sem perfil, o jogo continua jogável: meta-jogo é camada opcional.
    }
    await this.events.refresh();
    this.ui.setEvent(this.events.active);
    this.challenges.refresh();
    this.ui.renderChallenges(this.challenges.today, this.challenges.pendingRewards);
    void this.sync.flush();
  }

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    this.input.dispose();
  }

  // ---------------- máquina de estados ----------------

  private goToMenu(): void {
    this.state = 'menu';
    this.input.enabled = false;
    this.ui.renderMenuRecords(this.save.all);
    this.ui.showOnly('menu');
  }

  private goToCharacters(tab: LoadoutTab = 'characters'): void {
    this.state = 'characters';
    this.input.enabled = false;
    this.audio.unlock();
    this.loadoutTab = tab;
    this.renderLoadout();
    this.ui.showOnly('characters');
  }

  private renderLoadout(): void {
    this.ui.renderLoadout({
      tab: this.loadoutTab,
      coins: this.inventory.coinsSafe,
      characters: CHARACTERS,
      balls: BALLS,
      scenes: SCENES,
      selected: { characterId: this.character.id, ballId: this.ball.id, sceneId: this.scene.id },
      isOwned: (id, price) => this.inventory.isOwnedSafe(id, price),
    });
  }

  private selectCharacter(id: string): void {
    this.character = getCharacter(id);
    this.save.selectCharacter(id);
    this.audio.uiTap();
    this.renderLoadout();
  }

  private selectBall(id: string): void {
    this.ball = getBall(id);
    this.save.setLoadout({ ballId: id });
    this.audio.uiTap();
    this.renderLoadout();
  }

  private selectScene(id: string): void {
    this.scene = getScene(id);
    this.save.setLoadout({ sceneId: id });
    this.audio.uiTap();
    this.level.reset(undefined, this.scene);
    this.renderLoadout();
  }

  private async buy(id: string, price: number): Promise<void> {
    const ok = await this.inventory.buy(id, price);
    this.audio[ok ? 'comboUp' : 'bad']();
    this.ui.showToast(ok ? 'DESBLOQUEADO!' : 'MOEDAS INSUFICIENTES');
    this.ui.setCoins(this.inventory.coins);
    this.renderLoadout();
  }

  private goToChallenges(): void {
    this.state = 'challenges';
    this.input.enabled = false;
    this.challenges.refresh();
    this.ui.renderChallenges(this.challenges.today, this.challenges.pendingRewards);
    this.ui.showOnly('challenges');
  }

  private async claimChallenges(): Promise<void> {
    const total = this.challenges.claimAll();
    if (total <= 0) return;
    await this.inventory.grantCoins(total);
    this.audio.comboUp();
    this.ui.showToast(`+◎ ${total}`);
    this.ui.setCoins(this.inventory.coins);
    this.ui.renderChallenges(this.challenges.today, this.challenges.pendingRewards);
  }

  private async goToRanking(period: LeaderboardPeriod): Promise<void> {
    this.state = 'ranking';
    this.input.enabled = false;
    this.ui.showOnly('ranking');
    try {
      const entries = await this.api.getLeaderboard(period, 20);
      this.ui.renderRanking(entries, period,
        this.api.kind === 'local'
          ? 'Ranking local deste aparelho. O ranking online entra quando o backend estiver ligado.'
          : 'Ranking online.');
    } catch {
      this.ui.renderRanking([], period, 'Não foi possível carregar o ranking agora.');
    }
  }

  /**
   * Multiplayer assíncrono: publica a última tentativa como um desafio com
   * código. O adversário busca o código e tenta bater a marca.
   */
  private async handleDuel(): Promise<void> {
    const last = this.lastRun;
    if (!last) { this.ui.showToast('JOGUE UMA PARTIDA PRIMEIRO'); return; }
    const { code } = await this.api.publishDuel(last);
    this.ui.showToast(`CÓDIGO: ${code}`);
  }

  private goToStore(): void {
    this.state = 'store';
    this.input.enabled = false;
    this.ui.renderStore(this.store.products, this.inventory.coinsSafe);
    this.ui.showOnly('store');
  }

  private async purchase(productId: string): Promise<void> {
    const ok = await this.store.purchase(productId);
    this.audio[ok ? 'comboUp' : 'bad']();
    this.ui.showToast(ok ? 'COMPRA CONFIRMADA' : 'COMPRA NÃO CONCLUÍDA');
    this.ui.setCoins(this.inventory.coins);
    this.ui.renderStore(this.store.products, this.inventory.coinsSafe);
  }

  private handlePlay(): void {
    this.audio.unlock();
    this.audio.uiTap();
    if (!this.save.tutorialSeen) {
      this.state = 'tutorial';
      this.ui.showOnly('tutorial');
      return;
    }
    this.startRun();
  }

  /** §11/§20 — restart instantâneo: nenhuma tela intermediária. */
  private startRun(): void {
    this.audio.unlock();
    this.state = 'playing';
    this.runTime = 0;
    this.graceTime = 1.2;

    // Um evento pode forçar o cenário da temporada.
    const forced = this.events.forcedSceneId;
    const activeScene = forced ? getScene(forced) : this.scene;

    this.player.reset(this.character);
    this.ballController.reset(this.character, this.ball);
    this.combo.reset();
    this.score.reset();
    this.difficulty.reset();
    this.obstacles.reset();
    this.level.reset(undefined, activeScene);
    this.camera.reset();
    this.camera.z = -CONFIG.camera.distance;

    // Saque inicial: alto e lento de propósito. O primeiro contato é onde o
    // jogador está lendo a tela pela primeira vez — playtest humano mostrou
    // 40% das tentativas morrendo exatamente aqui, antes de qualquer toque.
    this.ballController.state.y = CONFIG.ball.serveHeight;
    this.ballController.state.vy = CONFIG.ball.serveImpulse * this.ball.impulse;

    this.ui.resetHudCache();
    this.ui.setEvent(this.events.active);
    this.ui.showOnly('hud');
    this.input.enabled = true;
  }

  private endRun(): void {
    this.state = 'gameover';
    this.input.enabled = false;
    this.audio.gameOver();
    vibrate([40, 60, 90]);
    this.camera.addShake(0.6);

    const stats: RunStats = this.score.snapshot(
      this.player.distance, this.combo.bestStreak, this.character.id,
    );
    // Multiplicador de evento entra na pontuação final, não durante a partida:
    // o jogador vê o número que vai para o ranking, sem HUD inflado.
    stats.score = Math.floor(stats.score * this.events.scoreMultiplier);

    const beat = this.save.submitRun(stats);
    this.ui.showGameOver(stats, this.save.all, beat);
    this.ui.showOnly('gameover');

    void this.finishRunMeta(stats);
  }

  /**
   * Meta-jogo do fim de partida: moedas, desafios e envio ao backend.
   * Roda DEPOIS da tela aparecer — o botão TENTAR NOVAMENTE nunca espera rede.
   */
  private async finishRunMeta(stats: RunStats): Promise<void> {
    const record: RunRecord = {
      runId: newId(),
      playerId: this.inventory.maybe?.id ?? 'local',
      nickname: this.inventory.maybe?.nickname ?? 'CRAQUE DA RUA',
      characterId: this.character.id,
      ballId: this.ball.id,
      sceneId: this.scene.id,
      distance: stats.distance,
      score: stats.score,
      touches: stats.touches,
      perfects: stats.perfects,
      bestCombo: stats.bestCombo,
      accuracy: stats.accuracy,
      playedAt: new Date().toISOString(),
    };
    this.lastRun = record;
    this.sync.enqueueRun(record);

    this.completedToday = this.challenges.applyRun(stats);
    const coins = this.inventory.computeReward(
      stats, this.combo.multiplier > 1 ? this.combo.multiplier : 0, this.events.coinMultiplier,
    );
    if (this.inventory.maybe) {
      try {
        await this.inventory.grantCoins(coins);
        this.ui.setCoins(this.inventory.coins);
      } catch { /* meta-jogo é best-effort; a partida já valeu */ }
    }
    this.ui.showGameOverExtras(coins, this.completedToday);
    this.ui.renderChallenges(this.challenges.today, this.challenges.pendingRewards);
  }

  // ---------------- input ----------------

  private handleGesture(g: TouchInput): void {
    if (this.state !== 'playing') return;
    const result = this.ballController.touch(g, this.player.x);
    if (!result) {
      this.ui.flashTouch('LONGE', 0);
      this.audio.whiff();
      return;
    }
    this.player.triggerKick();

    if (result.quality === 'BAD') {
      this.combo.degrade();
      this.audio.bad();
    } else {
      this.combo.register();
      if (result.quality === 'PERFECT') {
        this.audio.perfect();
        this.camera.addShake(0.12);
        vibrate(12);
      } else {
        this.audio.good();
      }
    }
    const gained = this.score.addTouch(result.quality, result.points, this.combo.multiplier);
    this.ui.flashTouch(result.quality, gained);
  }

  // ---------------- loop ----------------

  private frame = (now: number): void => {
    this.rafId = requestAnimationFrame(this.frame);
    // Clamp do delta: uma aba em background não pode teletransportar o jogo.
    const delta = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;

    if (this.state === 'playing') this.stepSimulation(delta);
    else this.stepIdle(delta);

    this.renderer.render(this.camera, this.level, this.player, this.ballController, this.character, this.runTime);
  };

  /** Passo fixo: a física roda sempre com o mesmo dt, em qualquer framerate. */
  private stepSimulation(delta: number): void {
    const step = CONFIG.physics.fixedStep;
    this.accumulator = Math.min(this.accumulator + delta, step * CONFIG.physics.maxSubSteps);

    while (this.accumulator >= step) {
      this.accumulator -= step;
      this.runTime += step;
      if (this.graceTime > 0) this.graceTime -= step;

      this.ballController.update(step);
      this.player.update(step, this.ballController.state.x);

      const tier = this.difficulty.update(this.player.distance);
      this.score.setDistance(this.player.distance);
      this.level.update(this.player.distance, tier.obstacleRate);

      const hit = this.obstacles.resolve(this.level, this.player.distance, this.player.x);
      if (hit) {
        this.player.push(hit.push);
        this.ballController.disturb(hit.push * 0.35);
        this.camera.addShake(0.3);
        this.audio.bad();
        vibrate(25);
        this.ui.showToast('CUIDADO!');
      }

      if (this.ballController.hasFallen()) {
        // A rede de segurança vale enquanto o jogador ainda não encostou na
        // bola nenhuma vez: ninguém deve perder antes de jogar.
        if (this.graceTime > 0 || this.ballController.totalTouches === 0) {
          this.ballController.state.y = this.ballController.radius + 0.02;
          this.ballController.state.vy = CONFIG.ball.serveImpulse * 0.82;
          this.ui.showToast('TOQUE QUANDO O ANEL FECHAR');
        } else {
          this.endRun();
          return;
        }
      }
    }

    this.camera.update(delta, this.player.x, this.player.distance, this.ballController.state.y);
    this.ui.updateHud({
      score: this.score.total,
      distance: this.player.distance,
      streak: this.combo.current,
      multiplier: this.combo.multiplier,
      comboProgress: this.combo.progress,
      record: this.save.all.bestScore,
      tierLabel: this.difficulty.tier.label,
    });
  }

  /** Menu/game over: o cenário continua vivo ao fundo, sem simular gameplay. */
  private stepIdle(delta: number): void {
    this.runTime += delta;
    if (this.state === 'menu' || this.state === 'characters' || this.state === 'tutorial') {
      this.player.distance += 2.4 * delta;
      this.player.stride = (this.player.stride + delta * 1.2) % 1;
      this.ballController.state.y = 0.9 + Math.sin(this.runTime * 2.4) * 0.45;
      this.ballController.state.spin += delta * 3;
      this.level.update(this.player.distance, 0);
    }
    this.camera.update(delta, this.player.x, this.player.distance, this.ballController.state.y);
  }
}
