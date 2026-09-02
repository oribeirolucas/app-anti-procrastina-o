import type { Character } from '../data/characters';
import type { RunStats, Records, TouchQuality } from '../core/types';
import { qs, el, fmtDistance, fmtScore } from '../ui/dom';

export interface HudData {
  score: number;
  distance: number;
  streak: number;
  multiplier: number;
  comboProgress: number;
  record: number;
  tierLabel: string;
}

export interface UICallbacks {
  onPlay: () => void;
  onOpenCharacters: () => void;
  onSelectCharacter: (id: string) => void;
  onBackToMenu: () => void;
  onRetry: () => void;
  onTutorialDone: () => void;
  onToggleSound: () => boolean;
}

const QUALITY_COLOR: Record<TouchQuality, string> = {
  PERFECT: '#7dfcb0',
  GOOD: '#ffe066',
  BAD: '#ff9f43',
  MISS: '#ff6b6b',
};

/**
 * Única camada que fala com o DOM. O gameplay nunca toca em `document`.
 * Atualizações do HUD são escritas só quando o valor muda (evita layout thrash).
 */
export class UIManager {
  private screens: Record<string, HTMLElement>;
  private hudEls: Record<string, HTMLElement>;
  private cache = { score: -1, distance: -1, streak: -1, mult: -1, tier: '', record: -1 };
  private feedbackTimer = 0;

  constructor(private cb: UICallbacks) {
    this.screens = {
      hud: qs('#hud'),
      menu: qs('#menu'),
      characters: qs('#characters'),
      tutorial: qs('#tutorial'),
      gameover: qs('#gameover'),
    };
    this.hudEls = {
      score: qs('#hud-score'),
      record: qs('#hud-record'),
      distance: qs('#hud-distance'),
      tier: qs('#hud-tier'),
      streak: qs('#hud-streak'),
      mult: qs('#hud-mult'),
      fill: qs('#hud-combo-fill'),
      feedback: qs('#feedback'),
      toast: qs('#toast'),
    };
    this.bind();
  }

  private bind(): void {
    qs('#btn-play').onclick = () => this.cb.onPlay();
    qs('#btn-characters').onclick = () => this.cb.onOpenCharacters();
    qs('#btn-char-play').onclick = () => this.cb.onPlay();
    qs('#btn-char-back').onclick = () => this.cb.onBackToMenu();
    qs('#btn-tut-start').onclick = () => this.cb.onTutorialDone();
    qs('#btn-retry').onclick = () => this.cb.onRetry();
    qs('#btn-go-characters').onclick = () => this.cb.onOpenCharacters();
    qs('#btn-go-menu').onclick = () => this.cb.onBackToMenu();
    const sound = qs('#btn-sound');
    sound.onclick = () => {
      const on = this.cb.onToggleSound();
      sound.textContent = `SOM: ${on ? 'LIGADO' : 'DESLIGADO'}`;
    };
  }

  showOnly(...names: string[]): void {
    for (const [key, node] of Object.entries(this.screens)) {
      node.classList.toggle('hidden', !names.includes(key));
    }
  }

  renderMenuRecords(r: Readonly<Records>): void {
    const node = qs('#menu-record');
    node.innerHTML = r.totalRuns === 0
      ? 'Toque em JOGAR e mantenha a bola no ar.'
      : `RECORDE <b>${fmtDistance(r.bestDistance)}</b> · <b>${fmtScore(r.bestScore)}</b> pts · sequência <b>${r.bestCombo}</b>`;
  }

  renderCharacters(list: readonly Character[], selectedId: string): void {
    const grid = qs('#char-grid');
    grid.innerHTML = '';
    for (const c of list) {
      const card = el('button', `char-card${c.id === selectedId ? ' selected' : ''}`);
      const head = el('div', 'char-head');
      const jersey = el('div', 'char-jersey', String(c.number));
      jersey.style.background = c.colors.primary;
      jersey.style.color = c.colors.secondary;
      const names = el('div');
      names.append(el('div', 'char-nick', c.nickname), el('div', 'char-name', c.name));
      head.append(jersey, names);
      card.append(head, el('div', 'char-arch', c.archetype));
      const labels: Array<[string, number]> = [
        ['CONTROLE', c.stars.controle], ['PRECISÃO', c.stars.precisao],
        ['TÉCNICA', c.stars.tecnica], ['EQUILÍBRIO', c.stars.equilibrio],
        ['VELOCIDADE', c.stars.velocidade],
      ];
      for (const [name, value] of labels) {
        const row = el('div', 'attr-row');
        const bar = el('div', 'attr-bar');
        const fill = el('div', 'attr-fill');
        fill.style.width = `${(value / 5) * 100}%`;
        bar.append(fill);
        row.append(el('span', 'attr-name', name), bar);
        card.append(row);
      }
      card.onclick = () => {
        this.cb.onSelectCharacter(c.id);
        for (const other of grid.children) other.classList.remove('selected');
        card.classList.add('selected');
      };
      grid.append(card);
    }
  }

  updateHud(d: HudData): void {
    const c = this.cache;
    const score = Math.floor(d.score);
    if (score !== c.score) { this.hudEls.score.textContent = fmtScore(score); c.score = score; }
    const dist = Math.floor(d.distance);
    if (dist !== c.distance) { this.hudEls.distance.textContent = fmtDistance(dist); c.distance = dist; }
    if (d.streak !== c.streak) { this.hudEls.streak.textContent = String(d.streak); c.streak = d.streak; }
    if (d.multiplier !== c.mult) { this.hudEls.mult.textContent = `x${d.multiplier}`; c.mult = d.multiplier; }
    if (d.tierLabel !== c.tier) { this.hudEls.tier.textContent = d.tierLabel; c.tier = d.tierLabel; }
    const rec = Math.floor(d.record);
    if (rec !== c.record) { this.hudEls.record.textContent = fmtScore(rec); c.record = rec; }
    this.hudEls.fill.style.width = `${Math.round(d.comboProgress * 100)}%`;
  }

  resetHudCache(): void {
    this.cache = { score: -1, distance: -1, streak: -1, mult: -1, tier: '', record: -1 };
  }

  flashTouch(quality: TouchQuality | 'LONGE', points: number): void {
    const node = this.hudEls.feedback;
    node.style.color = quality === 'LONGE' ? '#9aa3b5' : QUALITY_COLOR[quality];
    node.innerHTML = points > 0
      ? `${quality}<span class="pts">+${fmtScore(points)}</span>`
      : quality;
    node.classList.remove('pop');
    void node.offsetWidth; // força reflow para reiniciar a animação
    node.classList.add('pop');
    this.feedbackTimer = performance.now();
  }

  showToast(text: string): void {
    const node = this.hudEls.toast;
    node.textContent = text;
    node.classList.remove('show');
    void node.offsetWidth;
    node.classList.add('show');
  }

  showGameOver(stats: RunStats, records: Readonly<Records>, beat: { distance: boolean; score: boolean; combo: boolean }): void {
    const box = qs('#go-stats');
    box.innerHTML = '';
    if (beat.distance || beat.score || beat.combo) {
      box.append(el('div', 'new-record', 'NOVO RECORDE!'));
    }
    const rows: Array<[string, string, boolean]> = [
      ['DISTÂNCIA', fmtDistance(stats.distance), beat.distance],
      ['PONTUAÇÃO', fmtScore(stats.score), beat.score],
      ['MAIOR SEQUÊNCIA', String(stats.bestCombo), beat.combo],
      ['EMBAIXADINHAS', String(stats.touches), false],
      ['PERFECT', String(stats.perfects), false],
      ['PRECISÃO', `${Math.round(stats.accuracy * 100)}%`, false],
      ['RECORDE', `${fmtDistance(records.bestDistance)} · ${fmtScore(records.bestScore)} pts`, false],
    ];
    for (const [k, v, isRecord] of rows) {
      const row = el('div', `go-row${isRecord ? ' record' : ''}`);
      row.append(el('span', 'k', k), el('span', 'v', v));
      box.append(row);
    }
  }

  get lastFeedbackAt(): number { return this.feedbackTimer; }
}
