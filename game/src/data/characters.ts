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
  /** Preço em moedas. 0 = disponível desde o início (§20: nunca travar o core). */
  price: number;
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
    price: 0,
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
    price: 0,
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
    price: 0,
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
    price: 500,
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
    price: 900,
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
    price: 1400,
    attributes: { controle: 1.08, precisao: 1.25, tecnica: 1.0, equilibrio: 1.02, velocidade: 0.94 },
    stars: { controle: 4, precisao: 5, tecnica: 3, equilibrio: 4, velocidade: 2 },
  },
  {
    id: 'muralha',
    name: 'Kwame Adeyemi',
    nickname: 'A MURALHA',
    number: 4,
    archetype: 'Zagueiro que subiu do futsal — equilíbrio bruto',
    colors: { primary: '#0f9d58', secondary: '#ffffff', skin: '#5c3317', hair: '#0f0f0f' },
    price: 2000,
    attributes: { controle: 0.9, precisao: 0.92, tecnica: 1.05, equilibrio: 1.35, velocidade: 0.9 },
    stars: { controle: 2, precisao: 2, tecnica: 4, equilibrio: 5, velocidade: 2 },
  },
  {
    id: 'raio',
    name: 'Sora Takamine',
    nickname: 'O RAIO',
    number: 11,
    archetype: 'Ponta japonês — velocidade pura, pouca margem de erro',
    colors: { primary: '#1c2b6b', secondary: '#e8455f', skin: '#f0c8a0', hair: '#191919' },
    price: 2400,
    attributes: { controle: 0.88, precisao: 1.05, tecnica: 0.95, equilibrio: 0.9, velocidade: 1.3 },
    stars: { controle: 2, precisao: 4, tecnica: 3, equilibrio: 2, velocidade: 5 },
  },
  {
    id: 'ginga',
    name: 'Val Nascimento',
    nickname: 'A GINGA',
    number: 77,
    archetype: 'Craque de várzea — técnica de rua, imprevisível',
    colors: { primary: '#8b3ad6', secondary: '#ffd100', skin: '#6b4226', hair: '#2b1b10' },
    price: 3000,
    attributes: { controle: 1.1, precisao: 1.02, tecnica: 1.3, equilibrio: 1.0, velocidade: 1.0 },
    stars: { controle: 4, precisao: 3, tecnica: 5, equilibrio: 3, velocidade: 3 },
  },
  {
    id: 'sentinela',
    name: 'Idris Bakayoko',
    nickname: 'A SENTINELA',
    number: 5,
    archetype: 'Volante de contenção — leitura e frieza sob pressão',
    colors: { primary: '#e8e8e8', secondary: '#111111', skin: '#4a2c17', hair: '#141414' },
    price: 3600,
    attributes: { controle: 1.22, precisao: 1.05, tecnica: 1.0, equilibrio: 1.15, velocidade: 0.92 },
    stars: { controle: 5, precisao: 4, tecnica: 3, equilibrio: 4, velocidade: 2 },
  },
  {
    id: 'artilheira',
    name: 'Camila Duarte',
    nickname: 'A ARTILHEIRA',
    number: 19,
    archetype: 'Centroavante — finalização e domínio orientado',
    colors: { primary: '#e8455f', secondary: '#1b2a52', skin: '#c68642', hair: '#3b2314' },
    price: 4200,
    attributes: { controle: 1.12, precisao: 1.15, tecnica: 1.12, equilibrio: 1.08, velocidade: 1.05 },
    stars: { controle: 4, precisao: 5, tecnica: 4, equilibrio: 4, velocidade: 4 },
  },
  {
    id: 'lenda',
    name: 'Zé do Beco',
    nickname: 'A LENDA DA RUA',
    number: 0,
    archetype: 'Ninguém sabe a idade dele. Ninguém nunca viu a bola cair.',
    colors: { primary: '#111318', secondary: '#f5c518', skin: '#8d5524', hair: '#c9c9c9' },
    price: 8000,
    attributes: { controle: 1.3, precisao: 1.28, tecnica: 1.28, equilibrio: 1.28, velocidade: 1.15 },
    stars: { controle: 5, precisao: 5, tecnica: 5, equilibrio: 5, velocidade: 5 },
  },
] as const;

export const getCharacter = (id: string): Character =>
  CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
