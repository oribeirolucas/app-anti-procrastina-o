/**
 * §24 / Fase 4 — catálogo da loja. Produtos "duros" (moeda real) ficam atrás
 * da interface `PurchaseProvider`; nada de SDK de pagamento acoplado ao jogo.
 */
export type ProductKind = 'coins' | 'entitlement';

export interface Product {
  id: string;
  kind: ProductKind;
  title: string;
  description: string;
  /** Preço em centavos, na moeda local. Exibição só; a cobrança é do provider. */
  priceCents: number;
  /** Moedas creditadas (kind: 'coins'). */
  coins?: number;
  /** Direito permanente concedido (kind: 'entitlement'). */
  entitlement?: string;
}

export const PRODUCTS: readonly Product[] = [
  { id: 'coins_small', kind: 'coins', title: 'Punhado de moedas', description: '1.000 moedas', priceCents: 490, coins: 1000 },
  { id: 'coins_medium', kind: 'coins', title: 'Bolso cheio', description: '3.000 moedas', priceCents: 1290, coins: 3000 },
  { id: 'coins_large', kind: 'coins', title: 'Cofre da vila', description: '10.000 moedas', priceCents: 3490, coins: 10000 },
  { id: 'double_coins', kind: 'entitlement', title: 'Moedas em dobro', description: 'Todas as partidas rendem 2x para sempre', priceCents: 1990, entitlement: 'double_coins' },
] as const;

/** Economia: quanto uma tentativa rende. */
export const COIN_RATE = {
  perMeter: 0.35,
  perPerfect: 1.2,
  perComboTier: 12,
  /** Teto por tentativa — impede farm infinito de uma run muito longa. */
  cap: 900,
} as const;
