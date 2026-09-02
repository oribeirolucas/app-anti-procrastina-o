/**
 * Fase 4 — eventos por janela de tempo. Definidos como dados para que o
 * servidor possa substituí-los sem atualizar o app (o `EventManager` aceita
 * uma lista vinda da `GameApi`).
 */
export interface GameEvent {
  id: string;
  title: string;
  description: string;
  /** ISO 8601. */
  startsAt: string;
  endsAt: string;
  /** Multiplicador de moedas durante o evento. */
  coinMultiplier: number;
  /** Multiplicador de pontuação durante o evento. */
  scoreMultiplier: number;
  /** Cenário forçado durante o evento (opcional). */
  forcedSceneId?: string;
}

/**
 * Eventos locais de fallback: recorrentes por dia da semana, calculados em
 * runtime para não vencerem. Um backend pode sobrepor isso.
 */
export function localEvents(now: Date): GameEvent[] {
  const day = now.getUTCDay();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const window = { startsAt: startOfDay.toISOString(), endsAt: endOfDay.toISOString() };

  if (day === 0 || day === 6) {
    return [{
      id: 'weekend_rush',
      title: 'FINAL DE SEMANA NA RUA',
      description: 'Moedas em dobro em todas as tentativas.',
      coinMultiplier: 2, scoreMultiplier: 1, ...window,
    }];
  }
  if (day === 3) {
    return [{
      id: 'midweek_orla',
      title: 'QUARTA NA ORLA',
      description: 'Pontuação +50%.',
      coinMultiplier: 1, scoreMultiplier: 1.5, forcedSceneId: 'orla', ...window,
    }];
  }
  return [];
}
