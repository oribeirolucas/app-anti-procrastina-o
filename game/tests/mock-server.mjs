import { createServer } from 'node:http';

/**
 * Servidor de referência do contrato REST descrito em docs/api-contract.md.
 * Existe para o teste provar que o HttpGameApi fala o protocolo certo —
 * NÃO é o backend de produção.
 */
export function startMockServer({ port = 0, flakyFirstRun = false } = {}) {
  const state = {
    profile: { id: 'srv-player-1', nickname: 'REMOTO', linked: true, coins: 250, entitlements: [], owned: ['praia'] },
    runs: [],
    duels: new Map(),
    requests: [],
    runAttempts: 0,
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    state.requests.push(`${req.method} ${url.pathname}`);
    const send = (code, body) => {
      res.writeHead(code, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return send(204);

    let body = null;
    if (req.method === 'POST' || req.method === 'PATCH') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    }

    if (url.pathname === '/v1/profile' && req.method === 'GET') return send(200, state.profile);
    if (url.pathname === '/v1/profile' && req.method === 'PATCH') {
      state.profile = { ...state.profile, ...body };
      return send(200, state.profile);
    }
    if (url.pathname === '/v1/runs' && req.method === 'POST') {
      state.runAttempts++;
      // Simula um 503 transitório para exercitar o retry do cliente.
      if (flakyFirstRun && state.runAttempts === 1) return send(503, { error: 'indisponível' });
      state.runs.push(body);
      state.runs.sort((a, b) => b.score - a.score);
      return send(200, { accepted: true, coinsAwarded: 10, rank: state.runs.findIndex((r) => r.runId === body.runId) + 1 });
    }
    if (url.pathname === '/v1/leaderboard') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const period = url.searchParams.get('period') ?? 'daily';
      const cutoff = period === 'daily' ? Date.now() - 86400000 : 0;
      return send(200, state.runs
        .filter((r) => Date.parse(r.playedAt) >= cutoff)
        .slice(0, limit)
        .map((r, i) => ({
          rank: i + 1, playerId: r.playerId, nickname: r.nickname, score: r.score,
          distance: r.distance, characterId: r.characterId, isSelf: r.playerId === state.profile.id,
        })));
    }
    if (url.pathname === '/v1/events') {
      const now = Date.now();
      return send(200, [{
        id: 'srv_event', title: 'EVENTO DO SERVIDOR', description: 'Moedas x3.',
        startsAt: new Date(now - 3600000).toISOString(), endsAt: new Date(now + 3600000).toISOString(),
        coinMultiplier: 3, scoreMultiplier: 1,
      }]);
    }
    if (url.pathname === '/v1/duels' && req.method === 'POST') {
      const code = 'SRV123';
      state.duels.set(code, body);
      return send(200, { code });
    }
    if (url.pathname.startsWith('/v1/duels/')) {
      const code = url.pathname.split('/').pop();
      const run = state.duels.get(code);
      return run ? send(200, run) : send(404, { error: 'not found' });
    }
    send(404, { error: 'rota desconhecida' });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ server, state, url: `http://127.0.0.1:${server.address().port}` });
    });
  });
}
