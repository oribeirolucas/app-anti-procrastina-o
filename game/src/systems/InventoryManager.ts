import { COIN_RATE } from '../data/store';
import type { RunStats } from '../core/types';
import type { GameApi, Profile } from '../net/GameApi';

/**
 * Fase 4 — economia virtual. Moedas e itens desbloqueados vivem no `Profile`,
 * que é servido pela `GameApi`: local hoje, servidor depois, mesmo código.
 */
export class InventoryManager {
  private profile: Profile | null = null;

  constructor(private api: GameApi) {}

  async load(): Promise<Profile> {
    this.profile = await this.api.getProfile();
    return this.profile;
  }

  get current(): Profile {
    if (!this.profile) throw new Error('InventoryManager.load() não foi chamado');
    return this.profile;
  }

  /** Versão tolerante: o meta-jogo não pode quebrar se o perfil não carregou. */
  get maybe(): Profile | null { return this.profile; }

  get coins(): number { return this.profile?.coins ?? 0; }

  /** Leituras tolerantes: a UI pode renderizar antes do perfil carregar. */
  get coinsSafe(): number { return this.profile?.coins ?? 0; }
  isOwnedSafe(itemId: string, price: number): boolean {
    return price === 0 || (this.profile?.owned.includes(itemId) ?? false);
  }

  isOwned(itemId: string, price: number): boolean {
    if (price === 0) return true;
    return this.profile?.owned.includes(itemId) ?? false;
  }

  hasEntitlement(id: string): boolean {
    return this.profile?.entitlements.includes(id) ?? false;
  }

  /** Compra com moedas. Retorna false quando não há saldo. */
  async buy(itemId: string, price: number): Promise<boolean> {
    const p = this.current;
    if (p.owned.includes(itemId)) return true;
    if (p.coins < price) return false;
    this.profile = await this.api.updateProfile({
      coins: p.coins - price,
      owned: [...p.owned, itemId],
    });
    return true;
  }

  async grantCoins(amount: number): Promise<void> {
    if (amount <= 0) return;
    this.profile = await this.api.updateProfile({ coins: this.current.coins + amount });
  }

  async grantEntitlement(id: string): Promise<void> {
    const p = this.current;
    if (p.entitlements.includes(id)) return;
    this.profile = await this.api.updateProfile({ entitlements: [...p.entitlements, id] });
  }

  async setNickname(nickname: string): Promise<void> {
    this.profile = await this.api.updateProfile({ nickname: nickname.slice(0, 16).toUpperCase() });
  }

  /**
   * Moedas de uma tentativa. Com teto: uma run muito longa não pode virar
   * uma fonte infinita que destrói a economia.
   */
  computeReward(stats: RunStats, comboTiers: number, eventMultiplier: number): number {
    const base =
      stats.distance * COIN_RATE.perMeter +
      stats.perfects * COIN_RATE.perPerfect +
      comboTiers * COIN_RATE.perComboTier;
    const capped = Math.min(base, COIN_RATE.cap);
    const doubled = this.hasEntitlement('double_coins') ? 2 : 1;
    return Math.floor(capped * doubled * eventMultiplier);
  }
}
