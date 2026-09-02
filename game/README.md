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

## Estado do MVP

Fases 1 e 2 do escopo entregues (core gameplay, menu, seleção de personagem,
recorde local, tutorial, progressão de dificuldade, obstáculos). Fases 3 e 4
(conteúdo extra, ranking online, contas, economia) estão apenas **preparadas na
arquitetura** — ver `ARCHITECTURE.md`.
