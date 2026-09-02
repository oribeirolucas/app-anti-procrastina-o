import type { StorageAdapter } from '../systems/SaveManager';
import type { GameApi } from './GameApi';
import { LocalGameApi } from './LocalGameApi';
import { HttpGameApi } from './HttpGameApi';

/**
 * Único ponto onde se decide local vs. backend. Com `VITE_API_URL` definido no
 * build, o jogo inteiro passa a falar com o servidor — sem tocar em gameplay.
 */
export function createGameApi(storage: StorageAdapter): GameApi {
  const baseUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (baseUrl) {
    return new HttpGameApi({
      baseUrl,
      getToken: () => storage.read<string>('auth-token'),
    });
  }
  return new LocalGameApi(storage);
}

export * from './GameApi';
export { LocalGameApi } from './LocalGameApi';
export { HttpGameApi } from './HttpGameApi';
export { SyncQueue } from './SyncQueue';
