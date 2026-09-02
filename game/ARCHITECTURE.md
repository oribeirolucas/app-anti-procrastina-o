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

---

# Fases 3 e 4

## Fase 3 — conteúdo como dados

Nenhum módulo de gameplay conhece "a bola de praia" ou "a orla". Eles recebem
um objeto de dados e obedecem:

| Conteúdo | Onde mora | Quem consome |
|---|---|---|
| Personagens | `data/characters.ts` | `BallController` (atributos), `Renderer` (cores) |
| Bolas | `data/balls.ts` | `BallController` (impulso, caos, arrasto, raio), `Renderer` (padrão) |
| Cenários | `data/scenes.ts` | `LevelGenerator` (props, estruturas), `Renderer` (paleta) |
| Desafios | `data/challenges.ts` | `ChallengeManager` |

Adicionar conteúdo é adicionar um objeto — não há `if (sceneId === 'orla')` em
lugar nenhum do código.

**As bolas alteram a física, não a aparência.** Uma bola de praia é maior
(mais fácil de acertar), sobe 12% mais alto (mais tempo entre toques), tem 30%
menos caos — e por isso vale 5 pontos a menos por toque. A bola de meia é o
inverso: +60% de caos, +25 pontos. Isso transforma a escolha de equipamento
numa decisão de risco/recompensa, que é o que faz um item ser desejado.

**Desafios diários são determinísticos pela data** (`hash(YYYY-MM-DD)` como
semente). Todo jogador pega os mesmos três no mesmo dia — pré-requisito para
comparar desempenho e, na Fase 4, para ranking sazonal.

## Fase 4 — meta-jogo atrás de interfaces

```
GameManager
   ├── InventoryManager  (moedas, itens desbloqueados)  ─┐
   ├── ChallengeManager  (progresso diário)              │
   ├── EventManager      (janelas de tempo)             ─┤──> GameApi
   ├── StoreManager ──> PurchaseProvider                  │      ├── LocalGameApi (localStorage)
   └── SyncQueue         (fila offline persistida)       ─┘      └── HttpGameApi  (backend REST)
```

Decisões que sustentam isso:

1. **`GameApi` é a única fronteira com o mundo externo.** `createGameApi()` lê
   `VITE_API_URL` e devolve local ou HTTP. O gameplay não importa nenhum dos
   dois — trocar backend não toca em física, render ou input.

2. **O gameplay nunca espera pela rede.** O fim de partida mostra a tela de
   resultado *primeiro* e só então roda o meta-jogo (`finishRunMeta`). O botão
   TENTAR NOVAMENTE continua respondendo em dezenas de milissegundos mesmo com
   a rede caída — é o KPI do MVP e ele não podia regredir na Fase 4.

3. **`SyncQueue` persiste a tentativa antes de tentar enviá-la.** O jogo é
   jogado no metrô. Uma run nunca se perde porque a rede caiu: ela vai para uma
   fila em disco, reenviada quando `online` dispara. A fila descarta operações
   rejeitadas de forma definitiva (4xx) para que uma run inválida não bloqueie
   todas as outras atrás dela.

4. **Retry só em erro transitório.** 5xx e 429 fazem backoff exponencial; 4xx
   não é repetido — repetir um erro de contrato só queima bateria.

5. **Monetização atrás de `PurchaseProvider`.** Nenhum SDK de pagamento entra no
   bundle. Hoje há um `MockPurchaseProvider` que aprova sem cobrar; integrar
   App Store, Play ou um checkout web é implementar uma interface de um método.

6. **Multiplayer: assíncrono, não em tempo real.** O que existe é duelo por
   código — você publica sua tentativa, o amigo busca o código e tenta bater.
   PvP em tempo real exigiria servidor com estado, sincronização e tratamento de
   latência: é um projeto próprio, não um incremento, e não foi feito.

## O que NÃO foi implementado (e por quê)

| Item | Motivo |
|---|---|
| Backend de verdade | Não existe infra neste ambiente: sem provedor de auth, host ou banco definidos. O contrato está especificado e testado contra um servidor de referência |
| Conta de usuário / cloud save | Depende da escolha de provedor de auth (`Profile.linked` já existe para isso) |
| Cobrança real | Exige conta de loja ou gateway; o fluxo está pronto atrás da interface |
| Multiplayer em tempo real | Escopo de projeto próprio (ver item 6 acima) |
| Validação anti-cheat no servidor | Viável porque a física é determinística — exigiria enviar a trilha de inputs para replay. Documentado em `docs/api-contract.md` |

## Testes das Fases 3 e 4

`npm run metatest` (26 checks) cobre:

- Catálogos de bolas, cenários e craques, com itens bloqueados e preços.
- Economia: compra recusada sem saldo, débito correto, crédito por tentativa.
- Desafios: trio diário com um de cada tier, progresso e resgate.
- Cenário comprado chega ao `LevelGenerator` e troca os props gerados.
- Bola equipada altera a física de verdade (raio e impulso).
- **Contrato HTTP**: `HttpGameApi` exercitado de dentro do browser contra o
  servidor de referência — inclui retry de 503 e 404 virando `null`.
- **Fila offline**: run enfileirada com a rede fora do ar, persistida em disco
  e entregue quando a rede volta.
