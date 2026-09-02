import type { Character } from '../data/characters';
import type { Ball } from '../data/balls';
import type { Scene } from '../data/scenes';
import type { ChallengeDef } from '../data/challenges';
import { formatMetric } from '../data/challenges';
import type { Product } from '../data/store';
import type { GameEvent } from '../data/events';
import type { LeaderboardEntry, LeaderboardPeriod } from '../net/GameApi';
import type { ChallengeProgress } from './ChallengeManager';
import type { RunStats, Records, TouchQuality } from '../core/types';
import { qs, el, fmtDistance, fmtScore } from '../ui/dom';

export type LoadoutTab = 'characters' | 'balls' | 'scenes';

export interface LoadoutData {
  tab: LoadoutTab;
  coins: number;
  characters: readonly Character[];
  balls: readonly Ball[];
  scenes: readonly Scene[];
  selected: { characterId: string; ballId: string; sceneId: string };
  isOwned: (id: string, price: number) => boolean;
}

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
  onOpenCharacters: (tab?: LoadoutTab) => void;
  onSelectCharacter: (id: string) => void;
  onBackToMenu: () => void;
  onRetry: () => void;
  onTutorialDone: () => void;
  onToggleSound: () => boolean;
  onSelectTab: (tab: LoadoutTab) => void;
  onSelectBall: (id: string) => void;
  onSelectScene: (id: string) => void;
  onBuy: (id: string, price: number) => void;
  onOpenChallenges: () => void;
  onClaimChallenges: () => void;
  onOpenRanking: (period: LeaderboardPeriod) => void;
  onDuel: () => void;
  onOpenStore: () => void;
  onPurchase: (productId: string) => void;
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
      challenges: qs('#challenges'),
      ranking: qs('#ranking'),
      store: qs('#store'),
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
      event: qs('#hud-event'),
    };
    this.bind();
  }

  private bind(): void {
    qs('#btn-play').onclick = () => this.cb.onPlay();
    qs('#btn-characters').onclick = () => this.cb.onOpenCharacters('characters');
    qs('#btn-custom').onclick = () => this.cb.onOpenCharacters('balls');
    qs('#btn-challenges').onclick = () => this.cb.onOpenChallenges();
    qs('#btn-ranking').onclick = () => this.cb.onOpenRanking('daily');
    qs('#btn-store').onclick = () => this.cb.onOpenStore();
    qs('#btn-claim').onclick = () => this.cb.onClaimChallenges();
    qs('#btn-challenges-back').onclick = () => this.cb.onBackToMenu();
    qs('#btn-ranking-back').onclick = () => this.cb.onBackToMenu();
    qs('#btn-store-back').onclick = () => this.cb.onBackToMenu();
    qs('#btn-duel').onclick = () => this.cb.onDuel();
    for (const tab of document.querySelectorAll<HTMLElement>('#characters .tab')) {
      tab.onclick = () => this.cb.onSelectTab(tab.dataset.tab as LoadoutTab);
    }
    for (const tab of document.querySelectorAll<HTMLElement>('#ranking .tab')) {
      tab.onclick = () => this.cb.onOpenRanking(tab.dataset.period as LeaderboardPeriod);
    }
    qs('#btn-char-play').onclick = () => this.cb.onPlay();
    qs('#btn-char-back').onclick = () => this.cb.onBackToMenu();
    qs('#btn-tut-start').onclick = () => this.cb.onTutorialDone();
    qs('#btn-retry').onclick = () => this.cb.onRetry();
    qs('#btn-go-characters').onclick = () => this.cb.onOpenCharacters('characters');
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

  /** §12/§21/§22 — uma tela só para craque, bola e cenário: menos passos até jogar. */
  renderLoadout(data: LoadoutData): void {
    for (const tab of document.querySelectorAll<HTMLElement>('#characters .tab')) {
      tab.classList.toggle('active', tab.dataset.tab === data.tab);
    }
    qs('#loadout-coins').textContent = fmtScore(data.coins);
    const grid = qs('#char-grid');
    grid.innerHTML = '';
    if (data.tab === 'characters') {
      for (const c of data.characters) grid.append(this.characterCard(c, data));
    } else if (data.tab === 'balls') {
      for (const b of data.balls) grid.append(this.ballCard(b, data));
    } else {
      for (const sc of data.scenes) grid.append(this.sceneCard(sc, data));
    }
  }

  /** Card genérico: cabeçalho + preço + ação de compra/seleção. */
  private itemCard(
    id: string, price: number, selected: boolean, data: LoadoutData,
    onSelect: () => void,
  ): HTMLButtonElement {
    const owned = data.isOwned(id, price);
    const affordable = data.coins >= price;
    const card = el('button', 'char-card item-card');
    card.classList.toggle('selected', selected && owned);
    if (!owned) {
      card.classList.add('locked');
      card.classList.toggle('affordable', affordable);
      const tag = el('span', 'price', `◎ ${fmtScore(price)}`);
      card.append(tag);
      card.onclick = () => this.cb.onBuy(id, price);
    } else {
      card.onclick = onSelect;
    }
    return card;
  }

  private characterCard(c: Character, data: LoadoutData): HTMLElement {
    const card = this.itemCard(
      c.id, c.price, data.selected.characterId === c.id, data,
      () => this.cb.onSelectCharacter(c.id),
    );
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
    return card;
  }

  private ballCard(b: Ball, data: LoadoutData): HTMLElement {
    const card = this.itemCard(
      b.id, b.price, data.selected.ballId === b.id, data,
      () => this.cb.onSelectBall(b.id),
    );
    const head = el('div', 'char-head');
    const swatch = el('div', 'item-swatch');
    swatch.style.background = `radial-gradient(circle at 35% 30%, ${b.colors.base}, ${b.colors.accent})`;
    head.append(swatch, el('div', 'char-nick', b.name));
    card.append(head, el('div', 'char-arch', b.description));
    // Mostra o efeito real na física, não só a estética.
    const effects: Array<[string, string]> = [
      ['TAMANHO', `${Math.round(b.radius * 100)}cm`],
      ['ALTURA', `${b.impulse >= 1 ? '+' : ''}${Math.round((b.impulse - 1) * 100)}%`],
      ['CAOS', `${b.chaos >= 1 ? '+' : ''}${Math.round((b.chaos - 1) * 100)}%`],
      ['PONTOS/TOQUE', `${b.scoreBonus >= 0 ? '+' : ''}${b.scoreBonus}`],
    ];
    for (const [k, v] of effects) {
      const row = el('div', 'attr-row');
      row.append(el('span', 'attr-name', k), el('span', 'row-value', v));
      card.append(row);
    }
    return card;
  }

  private sceneCard(sc: Scene, data: LoadoutData): HTMLElement {
    const card = this.itemCard(
      sc.id, sc.price, data.selected.sceneId === sc.id, data,
      () => this.cb.onSelectScene(sc.id),
    );
    const head = el('div', 'char-head');
    const preview = el('div', 'item-scene');
    preview.style.background = `linear-gradient(180deg, ${sc.sky.top}, ${sc.sky.bottom} 55%, ${sc.road.a} 55%)`;
    head.append(preview, el('div', 'char-nick', sc.name));
    card.append(head, el('div', 'char-arch', sc.description));
    return card;
  }

  renderChallenges(items: Array<{ def: ChallengeDef; progress: ChallengeProgress }>, pending: number): void {
    const list = qs('#challenge-list');
    list.innerHTML = '';
    for (const { def, progress } of items) {
      const row = el('div', `list-row${progress.done ? ' done' : ''}`);
      const main = el('div', 'row-main');
      main.append(el('div', 'row-title', def.title));
      const ratio = Math.min(1, progress.best / def.target);
      main.append(el('div', 'row-sub',
        progress.claimed ? 'Resgatado'
          : progress.done ? 'Concluído — resgate a recompensa'
          : `${formatMetric(def.metric, progress.best)} de ${formatMetric(def.metric, def.target)}`));
      const bar = el('div', 'row-bar');
      const fill = el('div', 'row-fill');
      fill.style.width = `${ratio * 100}%`;
      bar.append(fill);
      main.append(bar);
      row.append(main, el('div', 'row-value', `◎ ${def.reward}`));
      list.append(row);
    }
    const claim = qs<HTMLButtonElement>('#btn-claim');
    claim.disabled = pending === 0;
    claim.textContent = pending > 0 ? `RESGATAR ◎ ${fmtScore(pending)}` : 'NADA PARA RESGATAR';
    const badge = qs('#challenge-badge');
    const readyCount = items.filter((i) => i.progress.done && !i.progress.claimed).length;
    badge.classList.toggle('hidden', readyCount === 0);
    badge.textContent = String(readyCount);
  }

  renderRanking(entries: LeaderboardEntry[], period: LeaderboardPeriod, source: string): void {
    for (const tab of document.querySelectorAll<HTMLElement>('#ranking .tab')) {
      tab.classList.toggle('active', tab.dataset.period === period);
    }
    const list = qs('#ranking-list');
    list.innerHTML = '';
    if (entries.length === 0) {
      list.append(el('div', 'list-row', 'Nenhuma tentativa registrada ainda.'));
    }
    for (const e of entries) {
      const row = el('div', `list-row${e.isSelf ? ' self' : ''}`);
      const main = el('div', 'row-main');
      main.append(el('div', 'row-title', e.nickname));
      main.append(el('div', 'row-sub', fmtDistance(e.distance)));
      row.append(el('div', 'row-rank', `${e.rank}`), main, el('div', 'row-value', fmtScore(e.score)));
      list.append(row);
    }
    qs('#ranking-source').textContent = source;
  }

  renderStore(products: readonly Product[], coins: number): void {
    qs('#store-coins').textContent = fmtScore(coins);
    const list = qs('#store-list');
    list.innerHTML = '';
    for (const p of products) {
      const row = el('div', 'list-row');
      const main = el('div', 'row-main');
      main.append(el('div', 'row-title', p.title), el('div', 'row-sub', p.description));
      const buy = el('button', 'btn small', `R$ ${(p.priceCents / 100).toFixed(2).replace('.', ',')}`);
      buy.onclick = () => this.cb.onPurchase(p.id);
      row.append(main, buy);
      list.append(row);
    }
  }

  setCoins(coins: number): void {
    qs('#menu-coins').textContent = fmtScore(coins);
  }

  setEvent(event: GameEvent | null): void {
    const banner = qs('#event-banner');
    banner.classList.toggle('hidden', !event);
    if (event) {
      banner.innerHTML = '';
      banner.append(el('b', undefined, event.title), el('span', undefined, event.description));
    }
    const chip = this.hudEls.event;
    chip.classList.toggle('hidden', !event);
    if (event) chip.textContent = event.title;
  }

  showGameOverExtras(coins: number, completed: ChallengeDef[]): void {
    const box = qs('#go-extra');
    box.innerHTML = '';
    const row = el('div', 'reward-row');
    row.append(el('span', undefined, 'MOEDAS GANHAS'), el('span', undefined, `◎ ${fmtScore(coins)}`));
    box.append(row);
    for (const c of completed) {
      box.append(el('div', 'challenge-done', `DESAFIO CONCLUÍDO: ${c.title}`));
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
