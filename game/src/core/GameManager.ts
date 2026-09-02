import { CONFIG } from '../data/config';
import { CHARACTERS, getCharacter, type Character } from '../data/characters';
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

/**
 * Orquestrador. Não implementa regra de jogo nenhuma: apenas conecta os
 * módulos, roda a máquina de estados e o loop com passo fixo (§19).
 */
export class GameManager {
  private state: GameState = 'boot';
  /** Exposto para ferramentas de teste/telemetria; somente leitura. */
  get activeCharacter(): Character { return this.character; }
  private character: Character;

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
  private readonly ball: BallController;

  private lastTime = 0;
  private accumulator = 0;
  private runTime = 0;
  private rafId = 0;
  /** Carência inicial: a bola entra em jogo sem punir o jogador. */
  private graceTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.character = getCharacter(this.save.selectedCharacter);
    this.player = new PlayerController(this.character);
    this.ball = new BallController(this.character);

    this.ui = new UIManager({
      onPlay: () => this.handlePlay(),
      onOpenCharacters: () => this.goToCharacters(),
      onSelectCharacter: (id) => this.selectCharacter(id),
      onBackToMenu: () => this.goToMenu(),
      onRetry: () => this.startRun(),
      onTutorialDone: () => { this.save.markTutorialSeen(); this.startRun(); },
      onToggleSound: () => {
        this.audio.setMuted(!this.audio.muted);
        return !this.audio.muted;
      },
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
      this.ball.driftPerTouch = tier.drift;
      this.ui.showToast(tier.label);
    };

    window.addEventListener('resize', () => this.renderer.resize(this.camera));
    this.renderer.resize(this.camera);
  }

  start(): void {
    this.level.reset();
    this.goToMenu();
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
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

  private goToCharacters(): void {
    this.state = 'characters';
    this.input.enabled = false;
    this.audio.unlock();
    this.ui.renderCharacters(CHARACTERS, this.character.id);
    this.ui.showOnly('characters');
  }

  private selectCharacter(id: string): void {
    this.character = getCharacter(id);
    this.save.selectCharacter(id);
    this.audio.uiTap();
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
    this.graceTime = 0.9;

    this.player.reset(this.character);
    this.ball.reset(this.character);
    this.combo.reset();
    this.score.reset();
    this.difficulty.reset();
    this.obstacles.reset();
    this.level.reset();
    this.camera.reset();
    this.camera.z = -CONFIG.camera.distance;

    // Saque inicial: a bola sobe sozinha e o primeiro toque é do jogador.
    this.ball.state.vy = CONFIG.ball.baseImpulse * 0.92;

    this.ui.resetHudCache();
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
    const beat = this.save.submitRun(stats);
    this.ui.showGameOver(stats, this.save.all, beat);
    this.ui.showOnly('gameover');
  }

  // ---------------- input ----------------

  private handleGesture(g: TouchInput): void {
    if (this.state !== 'playing') return;
    const result = this.ball.touch(g, this.player.x);
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

    this.renderer.render(this.camera, this.level, this.player, this.ball, this.character, this.runTime);
  };

  /** Passo fixo: a física roda sempre com o mesmo dt, em qualquer framerate. */
  private stepSimulation(delta: number): void {
    const step = CONFIG.physics.fixedStep;
    this.accumulator = Math.min(this.accumulator + delta, step * CONFIG.physics.maxSubSteps);

    while (this.accumulator >= step) {
      this.accumulator -= step;
      this.runTime += step;
      if (this.graceTime > 0) this.graceTime -= step;

      this.ball.update(step);
      this.player.update(step, this.ball.state.x);

      const tier = this.difficulty.update(this.player.distance);
      this.score.setDistance(this.player.distance);
      this.level.update(this.player.distance, tier.obstacleRate);

      const hit = this.obstacles.resolve(this.level, this.player.distance, this.player.x);
      if (hit) {
        this.player.push(hit.push);
        this.ball.disturb(hit.push * 0.35);
        this.camera.addShake(0.3);
        this.audio.bad();
        vibrate(25);
        this.ui.showToast('CUIDADO!');
      }

      if (this.ball.hasFallen()) {
        if (this.graceTime > 0) {
          // Rede de segurança apenas no saque inicial.
          this.ball.state.y = CONFIG.ball.radius + 0.02;
          this.ball.state.vy = CONFIG.ball.baseImpulse * 0.8;
        } else {
          this.endRun();
          return;
        }
      }
    }

    this.camera.update(delta, this.player.x, this.player.distance, this.ball.state.y);
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
      this.ball.state.y = 0.9 + Math.sin(this.runTime * 2.4) * 0.45;
      this.ball.state.spin += delta * 3;
      this.level.update(this.player.distance, 0);
    }
    this.camera.update(delta, this.player.x, this.player.distance, this.ball.state.y);
  }
}
