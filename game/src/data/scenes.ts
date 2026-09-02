import type { PropKind } from '../gameplay/LevelGenerator';

/**
 * §22 — cenários como dados. O LevelGenerator não sabe o que é "praia": ele lê
 * uma paleta e uma tabela de props. Adicionar cenário = adicionar objeto aqui.
 */
export interface Scene {
  id: string;
  name: string;
  description: string;
  price: number;
  sky: { top: string; middle: string; bottom: string };
  skyline: string;
  ground: { near: string; far: string };
  road: { a: string; b: string };
  sidewalk: { a: string; b: string };
  curb: string;
  laneMark: string;
  /** Cores possíveis dos volumes altos (prédios, coqueiros, arquibancada). */
  structureColors: readonly string[];
  /** Tipo de volume alto que ladeia a pista. */
  structure: 'building' | 'palm' | 'bleacher';
  /** Props decorativos possíveis na calçada. */
  decor: readonly PropKind[];
  /** Obstáculos possíveis nesta ambientação. */
  obstacles: readonly PropKind[];
  /** Janelas acesas (só faz sentido em prédio). */
  litWindows: boolean;
}

export const SCENES: readonly Scene[] = [
  {
    id: 'rua',
    name: 'RUA URBANA',
    description: 'Fim de tarde na cidade. O cenário original.',
    price: 0,
    sky: { top: '#1b2a52', middle: '#3d5c8f', bottom: '#f0a75e' },
    skyline: '#243256',
    ground: { near: '#7a8496', far: '#5c6473' },
    road: { a: '#3a3f4b', b: '#363b46' },
    sidewalk: { a: '#b9bfc9', b: '#b3b9c3' },
    curb: '#d8dce3',
    laneMark: '#e8d98a',
    structureColors: ['#3b4a63', '#44506b', '#4d5a75', '#37435c', '#5a6480'],
    structure: 'building',
    decor: ['tree', 'pole', 'bench', 'bin', 'sign', 'hydrant', 'car'],
    obstacles: ['pedestrian', 'cone', 'bin', 'bike', 'scooter', 'pothole'],
    litWindows: true,
  },
  {
    id: 'orla',
    name: 'ORLA',
    description: 'Calçadão de praia ao meio-dia. Areia, coqueiro e sol na cara.',
    price: 600,
    sky: { top: '#1a7fd4', middle: '#5cc0f0', bottom: '#e8f6ff' },
    skyline: '#7cc9e8',
    ground: { near: '#e8d3a0', far: '#d9c089' },
    road: { a: '#c9a86a', b: '#c3a264' },
    sidewalk: { a: '#e2e6ea', b: '#dadfe4' },
    curb: '#ffffff',
    laneMark: '#ffffff',
    structureColors: ['#2f8f5b', '#38a066', '#2a7d4f'],
    structure: 'palm',
    decor: ['tree', 'pole', 'bench', 'bin', 'sign'],
    obstacles: ['pedestrian', 'cone', 'bin', 'bike', 'scooter'],
    litWindows: false,
  },
  {
    id: 'quadra',
    name: 'QUADRA DA VILA',
    description: 'Quadra de cimento sob refletor. Alambrado e torcida.',
    price: 1200,
    sky: { top: '#0a0d16', middle: '#141c30', bottom: '#2a3350' },
    skyline: '#151d33',
    ground: { near: '#4a4f5c', far: '#3a3f4b' },
    road: { a: '#5f6b7a', b: '#5a6674' },
    sidewalk: { a: '#39414f', b: '#343c49' },
    curb: '#7d859a',
    laneMark: '#f2f4f8',
    structureColors: ['#2b3242', '#333b4d', '#252b38'],
    structure: 'bleacher',
    decor: ['pole', 'bench', 'bin', 'sign'],
    obstacles: ['pedestrian', 'cone', 'bin', 'pothole'],
    litWindows: false,
  },
] as const;

export const getScene = (id: string): Scene =>
  SCENES.find((s) => s.id === id) ?? SCENES[0];
