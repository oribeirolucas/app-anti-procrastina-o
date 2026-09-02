import type { StorageAdapter } from '../systems/SaveManager';
import { ApiError, type GameApi, type RunRecord } from './GameApi';

interface PendingOp {
  id: string;
  kind: 'submitRun';
  payload: RunRecord;
  attempts: number;
  queuedAt: string;
}

const KEY = 'sync-queue';
const MAX_QUEUE = 100;
const MAX_ATTEMPTS = 6;

/**
 * Fase 4 — o jogo é jogado no ônibus, no elevador, no metrô. Uma tentativa
 * nunca pode ser perdida porque a rede caiu: ela entra na fila, é persistida e
 * reenviada depois. O gameplay não espera pela rede em nenhum momento.
 */
export class SyncQueue {
  private queue: PendingOp[];
  private flushing = false;

  constructor(private storage: StorageAdapter, private api: GameApi) {
    this.queue = this.storage.read<PendingOp[]>(KEY) ?? [];
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => void this.flush());
    }
  }

  get pending(): number { return this.queue.length; }

  enqueueRun(run: RunRecord): void {
    this.queue.push({ id: run.runId, kind: 'submitRun', payload: run, attempts: 0, queuedAt: new Date().toISOString() });
    // Descarta o mais antigo se estourar: memória local é finita e a tentativa
    // velha vale menos que a recente.
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    this.persist();
    void this.flush();
  }

  /** Tenta esvaziar a fila. Nunca lança: falha de rede é estado normal. */
  async flush(): Promise<{ sent: number; remaining: number }> {
    if (this.flushing) return { sent: 0, remaining: this.queue.length };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { sent: 0, remaining: this.queue.length };
    }
    this.flushing = true;
    let sent = 0;
    try {
      while (this.queue.length > 0) {
        const op = this.queue[0];
        try {
          await this.api.submitRun(op.payload);
          this.queue.shift();
          sent++;
        } catch (err) {
          op.attempts++;
          const permanent = err instanceof ApiError && !err.retriable;
          if (permanent || op.attempts >= MAX_ATTEMPTS) {
            // Rejeitada de vez (payload inválido, run recusada): descarta para
            // não travar a fila inteira atrás de uma operação impossível.
            this.queue.shift();
          }
          break;
        } finally {
          this.persist();
        }
      }
    } finally {
      this.flushing = false;
    }
    return { sent, remaining: this.queue.length };
  }

  private persist(): void { this.storage.write(KEY, this.queue); }
}
