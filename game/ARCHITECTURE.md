# Arquitetura — STREET Jogo de Embaixadinhas

## Por que esta stack

O repositório já era um monorepo (`/server` tRPC+Drizzle, `/client` React+Tailwind)
de **outro produto**. O jogo entra como app independente em `/game`, sem tocar no
que existe e sem impor dependências cruzadas.

| Decisão | Escolha | Alternativa descartada | Motivo |
|---|---|---|---|
| Runtime | Vite + TypeScript, **zero dependências de runtime** | React, Phaser | O bundle é 13KB gzip. Um framework de UI não ajuda um canvas em 60fps e o custo de boot em 4G é o primeiro filtro de retenção de um casual mobile |
| Render | Canvas 2D com **projeção perspectiva manual** | Three.js / Babylon | Three.js custa ~600KB e um contexto WebGL só para desenhar quads e círculos. Aqui controlamos o frame budget inteiro e a arte é estilizada por decisão (§17), não por limitação |
| Física | **Motor próprio determinístico** | Rapier, Matter.js, Cannon | §3 exige que o jogador só perca por erro de execução. Engines genéricas trazem jitter de solver e não-determinismo entre plataformas — inaceitável quando a janela de PERFECT é de 55ms |
| Loop | Passo fixo (1/120s) + acumulador | `dt` variável | A física precisa ser idêntica em 30, 60 e 120Hz. Com `dt` variável, um celular fraco mudaria as janelas de timing |
| Save | `StorageAdapter` (interface) | `localStorage` direto | Trocar por backend na Fase 4 não toca em gameplay |

## Módulos

```
src/
  core/       GameManager (orquestrador + máquina de estados + loop)
              math, types, events, ObjectPool
  gameplay/   BallPhysics      integração + predições analíticas (puro)
              BallController   estado da bola + sistema de embaixadinhas
              PlayerController corrida automática + perseguição lateral
              InputController  gestos -> comandos
              ComboManager     sequência e multiplicador em degraus
              ScoreManager     pontuação e precisão
              DifficultyManager faixas por distância
              LevelGenerator   geração procedural infinita + pooling
              ObstacleManager  colisão e empurrão lateral
  render/     Camera (3ª pessoa + projeção), Renderer (painter's algorithm)
  systems/    UIManager (única camada que fala com o DOM)
              SaveManager (+ StorageAdapter), AudioManager (WebAudio sintetizado)
  data/       config.ts (todo o tuning), characters.ts (roster modular)
  ui/         styles.css, helpers de DOM
```

Regra que sustenta tudo: **gameplay não conhece render nem DOM**. `BallController`
devolve um `TouchResult` puro; quem transforma isso em som, texto e vibração é o
`GameManager`. Isso é o que permite rodar a física isolada no teste de determinismo.

## A mecânica, em uma frase

A bola é um projétil balístico com um **instante ideal de contato** calculado
analiticamente (`timeToDescendingHeight`): o momento em que ela cruza 0,42m
**descendo**. O input mede o erro contra esse instante. Não há animação de
embaixadinha "automática" — cada toque é um impulso real sobre a velocidade.

Consequências de design:

- `PERFECT` **limpa** a bola (corta velocidade lateral pela metade e puxa para o
  eixo do pé). É o único jeito de estabilizar uma bola que começou a fugir.
- `BAD` devolve a bola mais baixa e torta, encurtando a janela seguinte. Erros
  se acumulam — é daí que vem a curva de tensão.
- Falhar não é aleatório: o drift de dificuldade é uma **onda determinística**
  (`sin(touchCount)`), não `Math.random()`.
- Martelar a tela não funciona: dois gestos desperdiçados rebaixam a qualidade
  do próximo contato (`whiffStreak`).
- Obstáculos **nunca matam**: empurram o craque lateralmente, o que estraga a
  linha da bola. A única condição de derrota continua sendo "a bola caiu".

A bola é dominada na vertical do **pé direito** (`ball.footOffset`), não do centro
do corpo — além de ser o gesto real, é o que a tira de cima da silhueta do craque
numa câmera de 3ª pessoa.

## Performance (§18)

- Passo fixo com teto de substeps: um stutter não vira espiral da morte.
- Segmentos e props reciclados via `ObjectPool` — memória constante em qualquer
  distância.
- Culling por distância (110m) e `drawList` reutilizado (sem alocação por frame).
- DPR limitado a 2: em telas 3x o custo de fill dobra sem ganho perceptível.
- Grade de janelas dos prédios com cap rígido — sem ele, um prédio colado na
  câmera gerava milhares de `fillRect` num frame (era um stall real de 140ms,
  detectado pelo playtest).
- HUD só escreve no DOM quando o valor muda.
- Áudio sintetizado em WebAudio: zero assets para baixar.

## Preparado para a Fase 4 (não implementado)

| Recurso futuro | Ponto de extensão já existente |
|---|---|
| Ranking online / cloud save | `StorageAdapter` — basta um `ApiAdapter` com a mesma interface |
| Conta de usuário | `SaveManager` é o único dono de estado persistente |
| Novos personagens/bolas | `data/characters.ts` é declarativo; o `Renderer` lê cores do personagem |
| Novos cenários | `LevelGenerator.buildSegment` recebe a paleta/props por parâmetro |
| Desafios e eventos | `DifficultyManager` já é função pura da distância — um modo desafio troca a tabela |
| Economia / monetização | Nenhum estado de jogo é global; o `GameManager` é o único orquestrador |

## Licenciamento de imagem (§12)

Todos os personagens são **originais**, criados a partir de arquétipos de estilo
de jogo. Nenhum nome, rosto, número, uniforme ou escudo de atleta ou clube real
é usado. A estrutura de `Character` (id, nome, número, cores, atributos) já
comporta um roster licenciado no futuro sem mudança de código.
