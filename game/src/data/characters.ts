/**
 * §12/§13 — Personagens ORIGINAIS inspirados em arquétipos de estilo de jogo.
 * Nenhum nome, rosto, número ou uniforme de atleta real é usado.
 * A arquitetura é modular: adicionar um personagem = adicionar um objeto aqui.
 */
export interface CharacterAttributes {
  /** Tolerância de timing (1.0 = padrão). Maior = janelas PERFECT/GOOD maiores. */
  controle: number;
  /** Força da correção de trajetória por swipe. */
  precisao: number;
  /** Reduz a penalidade de um toque BAD. */
  tecnica: number;
  /** Reduz o drift lateral acumulado. */
  equilibrio: number;
  /** Multiplicador de velocidade de corrida. */
  velocidade: number;
}

export interface Character {
  id: string;
  name: string;
  nickname: string;
  number: number;
  archetype: string;
  /** Cores do avatar/uniforme (fictícias). */
  colors: { primary: string; secondary: string; skin: string; hair: string };
  attributes: CharacterAttributes;
  /** 1-5, apenas para exibição em barras na UI. */
  stars: { controle: number; precisao: number; tecnica: number; equilibrio: number; velocidade: number };
}

export const CHARACTERS: readonly Character[] = [
  {
    id: 'maestro',
    name: 'Dico Andrade',
    nickname: 'O MAESTRO',
    number: 10,
    archetype: 'Maestro brasileiro — ritmo e leitura de jogo',
    colors: { primary: '#f5c518', secondary: '#0d7a3f', skin: '#8d5524', hair: '#1a1a1a' },
    attributes: { controle: 1.15, precisao: 1.0, tecnica: 1.1, equilibrio: 1.0, velocidade: 0.95 },
    stars: { controle: 5, precisao: 3, tecnica: 4, equilibrio: 3, velocidade: 3 },
  },
  {
    id: 'finalizador',
    name: 'Matías Quiroga',
    nickname: 'O FINALIZADOR',
    number: 9,
    archetype: 'Finalizador argentino — explosão e frieza',
    colors: { primary: '#6fb7e8', secondary: '#ffffff', skin: '#e0ac69', hair: '#3b2314' },
    attributes: { controle: 0.95, precisao: 1.1, tecnica: 1.0, equilibrio: 0.95, velocidade: 1.12 },
    stars: { controle: 3, precisao: 4, tecnica: 3, equilibrio: 3, velocidade: 5 },
  },
  {
    id: 'engenheiro',
    name: 'Lukas Brenner',
    nickname: 'O ENGENHEIRO',
    number: 8,
    archetype: 'Meia alemão — consistência e equilíbrio',
    colors: { primary: '#2b2b2b', secondary: '#e8e8e8', skin: '#f0c8a0', hair: '#c9a227' },
    attributes: { controle: 1.0, precisao: 1.0, tecnica: 1.05, equilibrio: 1.2, velocidade: 1.0 },
    stars: { controle: 4, precisao: 3, tecnica: 4, equilibrio: 5, velocidade: 3 },
  },
  {
    id: 'prodigio',
    name: 'Théo Marchand',
    nickname: 'O PRODÍGIO',
    number: 7,
    archetype: 'Craque francês — potência e domínio técnico',
    colors: { primary: '#1b3a8f', secondary: '#d4213d', skin: '#7a4b2a', hair: '#161616' },
    attributes: { controle: 1.05, precisao: 1.08, tecnica: 1.08, equilibrio: 1.05, velocidade: 1.06 },
    stars: { controle: 4, precisao: 4, tecnica: 4, equilibrio: 4, velocidade: 4 },
  },
  {
    id: 'guerreiro',
    name: 'Nico Ferreira',
    nickname: 'O GUERREIRO',
    number: 21,
    archetype: 'Atacante uruguaio — raça e recuperação',
    colors: { primary: '#4aa3df', secondary: '#111111', skin: '#c68642', hair: '#2b1b10' },
    attributes: { controle: 0.92, precisao: 0.95, tecnica: 1.2, equilibrio: 1.1, velocidade: 1.0 },
    stars: { controle: 2, precisao: 3, tecnica: 5, equilibrio: 4, velocidade: 3 },
  },
  {
    id: 'relojoeiro',
    name: 'Iker Salvat',
    nickname: 'O RELOJOEIRO',
    number: 6,
    archetype: 'Meia espanhol — precisão cirúrgica',
    colors: { primary: '#c8102e', secondary: '#ffd100', skin: '#e8b98c', hair: '#4a2c17' },
    attributes: { controle: 1.08, precisao: 1.25, tecnica: 1.0, equilibrio: 1.02, velocidade: 0.94 },
    stars: { controle: 4, precisao: 5, tecnica: 3, equilibrio: 4, velocidade: 2 },
  },
] as const;

export const getCharacter = (id: string): Character =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
