# STREET · Jogo de Embaixadinhas

MVP jogável de um endless runner de embaixadinhas: o craque corre por uma rua
urbana infinita e o jogador precisa manter a bola no ar. A bola tocou o asfalto,
acabou a tentativa.

## Rodar

```bash
cd game
npm install
npm run dev        # http://localhost:5180
npm run build      # bundle de produção
npm run playtest   # bot automatizado valida os 17 critérios de aceite do MVP
npm run metatest   # valida Fases 3 e 4 (conteúdo, economia, desafios, rede)
npm test           # os dois
```

Abra no celular pela rede local (`npm run dev` já expõe o host) — o jogo foi
desenhado para touch; teclado (`espaço`, `←`, `→`, `↑`) funciona no desktop.

## Como se joga

| Gesto | Efeito |
|---|---|
| **Tap** | Embaixadinha |
| **Swipe ↑** | Toque mais alto (mais tempo até o próximo toque) |
| **Swipe ←/→** | Corrige a trajetória lateral da bola |

O anel em volta da bola fecha conforme ela desce. Tocar quando o anel está
**verde** = `PERFECT`; **amarelo** = `GOOD`; fora da janela = `BAD` (a bola sai
torta e o próximo toque fica mais difícil). Se a bola escapar do alcance do pé,
ela cai — e a tentativa acaba.

## Números que definem o feel

Tudo em `src/data/config.ts`. Os principais:

| Parâmetro | Valor | Significado |
|---|---|---|
| `timing.perfect` | ±55ms | Janela de PERFECT (escala com o atributo CONTROLE) |
| `timing.good` | ±130ms | Janela de GOOD |
| `ball.contactHeight` | 0.42m | Altura ideal de contato, com a bola descendo |
| `ball.reachX` | 1.05m | Alcance lateral do pé |
| `physics.fixedStep` | 1/120s | Passo fixo do simulador |
| `difficulty[]` | 0/100/300/500/800m | Faixas de velocidade, drift e obstáculos |

## Testes

`npm run playtest` sobe um Chromium, joga a partida com um bot que dispara
`PointerEvent`s reais no canvas (mesmo caminho de input de um dedo) e verifica:
abrir → escolher craque → jogar → combo → obstáculos → game over → recorde →
restart. Inclui checagem de determinismo da física e de frame time sem picos.

Requer o dev server rodando (`npm run dev`) em `localhost:5180`.

## Conteúdo (Fase 3)

- **12 craques** originais — 3 liberados, 9 desbloqueáveis com moedas.
- **5 bolas**, cada uma com física própria (tamanho, altura do quique, caos e
  bônus de pontuação). Não é skin: a bola muda como se joga.
- **3 cenários** procedurais: rua urbana, orla e quadra da vila.
- **Desafios diários**: três por dia (um fácil, um médio, um difícil), sorteados
  deterministicamente pela data — todo mundo pega os mesmos.
- **Personalização**: craque + bola + cenário numa tela só.

## Meta-jogo (Fase 4)

Implementado no cliente, atrás de interfaces:

| Recurso | Estado |
|---|---|
| Economia (moedas, desbloqueios) | Funcionando, local |
| Ranking | Funcionando local; online quando o backend existir |
| Eventos com janela de tempo | Funcionando (calendário local; servidor pode sobrepor) |
| Duelo assíncrono por código | Funcionando local |
| Loja / monetização | Fluxo completo com `MockPurchaseProvider` — **nenhuma cobrança real** |
| Conta de usuário / cloud save | **Não implementado**: depende de provedor de auth |
| Multiplayer em tempo real | **Não implementado** |

Ligar o backend é definir `VITE_API_URL` no build: o jogo passa a usar
`HttpGameApi` no lugar de `LocalGameApi`, sem tocar em gameplay. O contrato REST
está em [`docs/api-contract.md`](docs/api-contract.md).

## Estado do projeto

Fases 1, 2 e 3 completas. Fase 4 entregue no cliente (economia, ranking,
eventos, duelo, loja, fila de sincronização offline) — o servidor em si não
existe ainda; ver a tabela acima e o contrato documentado.
