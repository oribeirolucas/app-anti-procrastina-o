/**
 * §21 — bolas como conteúdo desbloqueável. Cada bola altera a FÍSICA de forma
 * perceptível e legível, nunca só a cor: é isso que faz o jogador querer trocar.
 */
export interface Ball {
  id: string;
  name: string;
  description: string;
  /** Raio em metros — bolas maiores são mais fáceis de acertar e de ver. */
  radius: number;
  /** Multiplicador do impulso base. >1 sobe mais alto (mais tempo entre toques). */
  impulse: number;
  /** Multiplicador do arrasto lateral. >1 = a bola se corrige sozinha mais rápido. */
  drag: number;
  /** Multiplicador da instabilidade injetada por um toque BAD. */
  chaos: number;
  /** Bônus de pontuação por toque (risco/recompensa). */
  scoreBonus: number;
  colors: { base: string; accent: string; glow: string };
  /** Padrão desenhado sobre a bola. */
  pattern: 'classic' | 'stripes' | 'solid' | 'flame' | 'grid';
  /** Preço em moedas. 0 = já vem liberada. */
  price: number;
}

export const BALLS: readonly Ball[] = [
  {
    id: 'street',
    name: 'STREET',
    description: 'A bola de sempre. Equilibrada, previsível, sem desculpa.',
    radius: 0.135, impulse: 1.0, drag: 1.0, chaos: 1.0, scoreBonus: 0,
    colors: { base: '#fdfdfd', accent: '#171a21', glow: 'rgba(255,255,255,0.30)' },
    pattern: 'classic', price: 0,
  },
  {
    id: 'praia',
    name: 'BOLA DE PRAIA',
    description: 'Leve e lenta: sobe mais e perdoa o timing. Vale menos ponto.',
    radius: 0.165, impulse: 1.12, drag: 1.35, chaos: 0.7, scoreBonus: -5,
    colors: { base: '#ffd34d', accent: '#e8455f', glow: 'rgba(255,211,77,0.35)' },
    pattern: 'stripes', price: 300,
  },
  {
    id: 'futsal',
    name: 'FUTSAL',
    description: 'Pesada e baixa. Quica pouco, exige toque rápido. Paga mais.',
    radius: 0.115, impulse: 0.88, drag: 1.15, chaos: 0.9, scoreBonus: 12,
    colors: { base: '#f2f4f8', accent: '#1b6fd6', glow: 'rgba(120,180,255,0.32)' },
    pattern: 'grid', price: 800,
  },
  {
    id: 'meia',
    name: 'BOLA DE MEIA',
    description: 'Improvisada e imprevisível. Muito caos, muito ponto.',
    radius: 0.125, impulse: 1.0, drag: 0.8, chaos: 1.6, scoreBonus: 25,
    colors: { base: '#c9b18a', accent: '#7a5c33', glow: 'rgba(201,177,138,0.3)' },
    pattern: 'solid', price: 1500,
  },
  {
    id: 'chama',
    name: 'CHAMA',
    description: 'Rápida e nervosa. Só para quem já domina o ritmo.',
    radius: 0.13, impulse: 1.05, drag: 0.72, chaos: 1.35, scoreBonus: 35,
    colors: { base: '#ff7a2f', accent: '#3a0d00', glow: 'rgba(255,122,47,0.45)' },
    pattern: 'flame', price: 2600,
  },
] as const;

export const getBall = (id: string): Ball =>
  BALLS.find((b) => b.id === id) ?? BALLS[0];
