/**
 * Todos os números de tuning ficam aqui. Nenhum "magic number" espalhado pelo
 * gameplay — ajustar o feel do jogo deve ser editar um arquivo só.
 * Unidades: metros, segundos, m/s.
 */
export const CONFIG = {
  physics: {
    /** dt fixo do simulador. 120Hz dá previsibilidade no toque sem custo real. */
    fixedStep: 1 / 120,
    /** Máx. de substeps por frame (evita espiral da morte após stutter). */
    maxSubSteps: 8,
    gravity: -20,
    /** Arrasto lateral do ar (fração de vx perdida por segundo). */
    lateralDrag: 1.1,
    groundY: 0,
  },

  ball: {
    radius: 0.135,
    /** Altura ideal de contato: o pé bate aqui, com a bola DESCENDO. */
    contactHeight: 0.42,
    /**
     * A bola é dominada na vertical do pé direito, não do centro do corpo.
     * Além de ser o gesto real, isso tira a bola de cima da silhueta do craque
     * numa câmera de 3ª pessoa — sem isso ela some atrás do tronco no apex.
     */
    footOffset: 0.5,
    /** Impulso vertical de um toque normal (apex ~1.05m). */
    baseImpulse: 6.5,
    /**
     * Saque inicial: mais alto que um toque normal, de propósito. O primeiro
     * contato é o momento em que o jogador está lendo a tela pela primeira
     * vez — ele precisa de tempo para ver o anel fechar, não de reflexo.
     */
    serveImpulse: 8.6,
    serveHeight: 1.6,
    /** Multiplicador de impulso do swipe up. */
    swipeUpImpulse: 1.32,
    /** Alcance horizontal do pé. Além disso o toque é MISS por distância. */
    reachX: 1.05,
    /**
     * Janela vertical em que o pé alcança a bola. Subiu de 0.95 para 1.05
     * apenas para perdoar o toque adiantado — afrouxar mais tiraria o desafio
     * que o playtest aprovou.
     */
    reachYMax: 1.05,
    /** Correção lateral aplicada por um swipe (m/s). */
    swipeCorrection: 1.6,
    /** Instabilidade lateral injetada por um toque BAD (m/s). */
    badLateralKick: 0.85,
    /** Fração do impulso preservada num toque BAD (bola morre mais baixa). */
    badImpulseFactor: 0.72,
    perfectImpulseFactor: 1.03,
  },

  timing: {
    /**
     * Janelas em segundos, medidas contra o instante ideal de contato.
     *
     * DECISÃO DE CALIBRAÇÃO (playtest humano): estas janelas ficam apertadas
     * de propósito — o desafio é o produto. O que o playtest mostrou não foi
     * dificuldade demais, e sim 8 de 16 tentativas mortas ANTES do primeiro
     * toque: barreira de entrada, não desafio. A correção é toda no `assist`
     * abaixo e no saque inicial, nunca em afrouxar o jogo em regime.
     */
    perfect: 0.06,
    good: 0.145,
    /** Fora de `good` mas com a bola alcançável = BAD. */

    /**
     * Assist decrescente: só os PRIMEIROS toques têm janela ampliada, e ela
     * fecha rápido. É a rampa de entrada — aos 5 toques o jogador já está no
     * jogo cheio. "Fácil de aprender, difícil de dominar" é exatamente isto:
     * a curva mora aqui, não nas janelas em regime.
     */
    assistTouches: 5,
    assistStart: 1.9,
  },

  player: {
    /** Velocidade base de corrida (m/s) em 0m. */
    baseSpeed: 5.0,
    /** Velocidade lateral máxima do craque acompanhando a bola. */
    strafeSpeed: 3.4,
    strafeAccel: 12,
    laneHalfWidth: 3.2,
  },

  /** §6 — faixas de dificuldade por distância percorrida. */
  difficulty: [
    { from: 0,   speed: 5.0,  obstacleRate: 0.0,  drift: 0.0,  label: 'AQUECIMENTO' },
    { from: 100, speed: 6.6,  obstacleRate: 0.35, drift: 0.20, label: 'RITMO' },
    { from: 300, speed: 8.2,  obstacleRate: 0.55, drift: 0.45, label: 'PRESSÃO' },
    { from: 500, speed: 9.8,  obstacleRate: 0.75, drift: 0.75, label: 'ELITE' },
    { from: 800, speed: 11.4, obstacleRate: 0.9,  drift: 1.05, label: 'LENDA' },
  ],

  score: {
    perfect: 50,
    good: 20,
    bad: 5,
    /** Pontos por metro percorrido. */
    perMeter: 1,
  },

  /** §10 — degraus de combo. */
  comboTiers: [
    { touches: 0,   mult: 1 },
    { touches: 10,  mult: 2 },
    { touches: 25,  mult: 3 },
    { touches: 50,  mult: 5 },
    { touches: 100, mult: 10 },
    { touches: 250, mult: 20 },
  ],

  camera: {
    /** Offset atrás do jogador (m). */
    distance: 7.4,
    height: 3.55,
    /** Ponto para onde a câmera olha, acima do chão. */
    lookHeight: 0.7,
    /** Suavização do follow (maior = mais colada). */
    followSpeed: 6.5,
    fov: 1.05,
  },

  world: {
    segmentLength: 12,
    /** Segmentos vivos à frente do jogador. */
    segmentsAhead: 10,
    segmentsBehind: 2,
    roadHalfWidth: 4.6,
    sidewalkWidth: 2.4,
    /** Distância de culling (m). */
    drawDistance: 110,
  },

  obstacles: {
    /** Distância à frente do player em que o obstáculo começa a atrapalhar. */
    influenceRange: 7,
    /** Empurrão lateral que um obstáculo aplica ao craque (m/s). */
    dodgePush: 2.6,
  },
} as const;

export type DifficultyTier = (typeof CONFIG.difficulty)[number];
