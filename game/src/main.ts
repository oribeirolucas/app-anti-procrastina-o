import './ui/styles.css';
import { GameManager } from './core/GameManager';
import { qs } from './ui/dom';

const canvas = qs<HTMLCanvasElement>('#stage');
const game = new GameManager(canvas);
game.start();

// Evita o zoom por duplo toque no iOS durante a partida.
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Exposto só em dev, para tunar o feel pelo console.
if (import.meta.env.DEV) {
  (window as unknown as { game: GameManager }).game = game;
  // Superfície mínima para os testes automatizados construírem uma simulação
  // isolada (determinismo da física) sem passar pela UI.
  void import('./gameplay/BallController').then((m) => {
    (window as unknown as { __test: unknown }).__test = { BallController: m.BallController };
  });
}
