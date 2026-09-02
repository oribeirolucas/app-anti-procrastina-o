import { PRODUCTS, type Product } from '../data/store';
import type { InventoryManager } from './InventoryManager';

export interface PurchaseReceipt {
  productId: string;
  transactionId: string;
  /** Assinatura/recibo a ser validado no servidor (Fase 4). */
  token?: string;
}

/**
 * Fase 4 — monetização atrás de uma interface. Nenhum SDK de pagamento entra
 * no bundle do jogo: trocar por App Store / Play / Stripe é implementar isto.
 */
export interface PurchaseProvider {
  readonly kind: string;
  purchase(product: Product): Promise<PurchaseReceipt | null>;
}

/** Provider de desenvolvimento: aprova tudo, cobra nada. */
export class MockPurchaseProvider implements PurchaseProvider {
  readonly kind = 'mock';
  async purchase(product: Product): Promise<PurchaseReceipt> {
    return { productId: product.id, transactionId: `mock-${Date.now()}` };
  }
}

export class StoreManager {
  constructor(
    private inventory: InventoryManager,
    private provider: PurchaseProvider = new MockPurchaseProvider(),
  ) {}

  get products(): readonly Product[] { return PRODUCTS; }

  /**
   * Compra e concede. A concessão só acontece depois do recibo — num backend
   * real o recibo é validado do lado do servidor antes de creditar.
   */
  async purchase(productId: string): Promise<boolean> {
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) return false;
    const receipt = await this.provider.purchase(product);
    if (!receipt) return false;
    if (product.kind === 'coins' && product.coins) await this.inventory.grantCoins(product.coins);
    if (product.kind === 'entitlement' && product.entitlement) {
      await this.inventory.grantEntitlement(product.entitlement);
    }
    return true;
  }
}
