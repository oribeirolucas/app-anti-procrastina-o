# Contrato da API — STREET Jogo de Embaixadinhas

Este documento é a especificação do backend da Fase 4. O cliente que o consome é
`src/net/HttpGameApi.ts`; o servidor de referência usado nos testes é
`tests/mock-server.mjs` (**não** é o backend de produção).

Enquanto `VITE_API_URL` não estiver definido no build, o jogo usa
`LocalGameApi` (localStorage) e nenhuma destas rotas é chamada.

## Convenções

- Base: `${VITE_API_URL}` — todas as rotas sob `/v1`.
- `Content-Type: application/json` em requisição e resposta.
- Autenticação: `Authorization: Bearer <token>`. O token é lido de
  `localStorage['street-emb:auth-token']` — o fluxo de login/emissão é
  responsabilidade do provedor de auth escolhido, não do jogo.
- Erros: qualquer status ≥ 400 com corpo `{ "error": string }`.
  O cliente trata **5xx e 429 como transitórios** (faz retry com backoff
  exponencial, até 2 vezes) e **4xx como definitivos** (não repete).
- Timeout do cliente: 8s por requisição.

## Rotas

### `GET /v1/profile`
Perfil do jogador autenticado. Cria na primeira chamada, se não existir.

```json
{
  "id": "uuid",
  "nickname": "CRAQUE DA RUA",
  "linked": true,
  "coins": 250,
  "entitlements": ["double_coins"],
  "owned": ["praia", "orla"]
}
```

`owned` guarda ids de personagens, bolas e cenários desbloqueados.
`entitlements` guarda compras permanentes com dinheiro real.

### `PATCH /v1/profile`
Corpo: qualquer subconjunto de `nickname`, `coins`, `entitlements`, `owned`.
Resposta: o perfil completo já atualizado.

> **Nota de segurança para a implementação:** `coins` e `owned` chegando do
> cliente são uma superfície de trapaça. O servidor deve tratá-los como
> *intenção* e recalcular a economia do lado dele — o cliente é a UI, não a
> autoridade.

### `POST /v1/runs`
Corpo: um `RunRecord` (ver `src/net/GameApi.ts`).

```json
{
  "runId": "uuid", "playerId": "uuid", "nickname": "CRAQUE DA RUA",
  "characterId": "maestro", "ballId": "street", "sceneId": "rua",
  "distance": 321.4, "score": 9876, "touches": 80, "perfects": 70,
  "bestCombo": 60, "accuracy": 0.9, "playedAt": "2026-09-02T04:00:00.000Z"
}
```

Resposta: `{ "accepted": true, "coinsAwarded": 117, "rank": 4 }`

`runId` é gerado pelo cliente e é **idempotente**: a fila de sincronização pode
reenviar a mesma tentativa depois de uma falha de rede, e o servidor precisa
tratar o reenvio como a mesma run, não como uma nova.

### `GET /v1/leaderboard?period=daily|alltime&limit=20`
Resposta: array de entradas ordenadas por `score` decrescente.

```json
[{ "rank": 1, "playerId": "uuid", "nickname": "ZÉ", "score": 9876,
   "distance": 321.4, "characterId": "maestro", "isSelf": false }]
```

`isSelf` é calculado pelo servidor a partir do token.

### `GET /v1/events`
Eventos ativos e futuros. O cliente escolhe o que está dentro da janela.

```json
[{ "id": "weekend_rush", "title": "FINAL DE SEMANA NA RUA",
   "description": "Moedas em dobro.", "startsAt": "...", "endsAt": "...",
   "coinMultiplier": 2, "scoreMultiplier": 1, "forcedSceneId": "orla" }]
```

`forcedSceneId` é opcional. Publicar um evento novo aqui muda o jogo sem
atualizar o app.

### `POST /v1/duels`
Corpo: um `RunRecord`. Resposta: `{ "code": "AB12CD" }` — 6 caracteres do
alfabeto `A-Z2-9` sem `I`, `O`, `0` e `1` (evita confusão ao ditar o código).

### `GET /v1/duels/:code`
Resposta: o `RunRecord` publicado, ou **404** se o código não existe — o cliente
converte 404 em `null`, sem lançar exceção.

## O que falta decidir antes de implementar

| Assunto | Precisa da sua decisão |
|---|---|
| Provedor de auth | Supabase Auth (já usado no `/server` do outro produto), Firebase, ou anônimo com device id |
| Anti-cheat | Validar a run no servidor exige replay determinístico do input — a física já é determinística, o que torna isso viável, mas exige enviar a trilha de inputs |
| Hospedagem | Onde roda o backend e quanto custa por MAU |
| Pagamento | Loja de app (30%) vs. checkout web (ex.: Kiwify) |
