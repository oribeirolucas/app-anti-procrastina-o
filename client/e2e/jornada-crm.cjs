// Teste de ponta a ponta no navegador (Playwright) contra um servidor em execução.
// Uso: BASE_URL=http://localhost:3000 E2E_EMAIL=... E2E_SENHA=... node e2e/jornada-crm.cjs
// Cria registros com sufixo único marcados [E2E]; não altera dados existentes.
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SUFIXO = Date.now().toString(36);
const passos = [];
const passo = async (nome, fn) => { await fn(); passos.push(nome); console.log("✓", nome); };

(async () => {
  const navegador = await chromium.launch();
  const p = (globalThis.__pagina = await navegador.newPage({ viewport: { width: 1280, height: 800 } }));
  const errosJs = [];
  p.on("pageerror", (e) => errosJs.push(e.message));
  p.setDefaultTimeout(10000);
  const empresa = `[E2E] Clínica ${SUFIXO}`;
  const titulo = `[E2E] Plano Pro ${SUFIXO}`;

  await passo("login", async () => {
    await p.goto(BASE);
    await p.fill("input[type=email]", process.env.E2E_EMAIL);
    await p.fill("input[type=password]", process.env.E2E_SENHA);
    await p.click('button:has-text("Entrar")');
    await p.waitForSelector("text=Painel comercial");
  });
  await passo("criar empresa", async () => {
    await p.click("nav >> text=Empresas");
    await p.click("text=+ Empresa");
    await p.fill('label:has-text("Nome *") input', empresa);
    await p.click('.fixed button:has-text("Salvar")');
    await p.waitForSelector(`h1:has-text("${empresa}")`);
    await p.waitForSelector("text=Empresa cadastrada.");
  });
  await passo("criar contato", async () => {
    await p.click('section:has(h3:has-text("Contatos")) button:has-text("+")');
    await p.fill('label:has-text("Nome *") input', `[E2E] Dra. ${SUFIXO}`);
    await p.fill('label:has-text("E-mail") input', `e2e-${SUFIXO}@exemplo.invalid`);
    await p.click('.fixed button:has-text("Salvar")');
    await p.waitForSelector(`text=[E2E] Dra. ${SUFIXO}`);
  });
  await passo("abrir oportunidade", async () => {
    await p.click("text=+ Oportunidade");
    await p.fill('label:has-text("Título *") input', titulo);
    await p.fill('label:has-text("Valor mensal") input', "597,00");
    await p.click('.fixed button:has-text("Salvar")');
    await p.click(`a:has-text("${titulo}")`);
    await p.waitForSelector(`h1:has-text("${titulo}")`);
  });
  await passo("alterar etapa", async () => {
    await p.selectOption('select[aria-label="Etapa"]', { label: "Demonstração" });
    await p.click('button:has-text("Mover para Demonstração")');
    await p.waitForSelector('text=→ "Demonstração"');
  });
  await passo("registrar tarefa", async () => {
    await p.click('section:has(h3:has-text("Tarefas")) button:has-text("+")');
    await p.fill('label:has-text("Título *") input', `[E2E] Enviar proposta ${SUFIXO}`);
    await p.click('.fixed button:has-text("Salvar")');
    await p.waitForSelector(`text=[E2E] Enviar proposta ${SUFIXO}`);
  });
  await passo("concluir tarefa", async () => {
    await p.click(`li:has-text("[E2E] Enviar proposta ${SUFIXO}") input[type=checkbox]`);
    await p.waitForSelector(`li:has-text("[E2E] Enviar proposta ${SUFIXO}") span.line-through`);
  });
  await passo("registrar interação e consultar histórico após recarregar", async () => {
    await p.fill('textarea[placeholder="O que aconteceu?"]', `[E2E] ligação ${SUFIXO}`);
    await p.click('button:has-text("Registrar")');
    // Espera a confirmação do servidor e o item no histórico (não o texto no próprio campo),
    // senão o recarregamento abaixo cancela o envio ainda em andamento em rede lenta.
    await p.waitForSelector("text=Interação registrada.");
    await p.waitForSelector(`ol li:has-text("[E2E] ligação ${SUFIXO}")`);
    await p.reload();
    await p.waitForSelector(`ol li:has-text("[E2E] ligação ${SUFIXO}")`);
    await p.waitForSelector("text=Oportunidade criada na etapa");
  });
  await passo("celular sem rolagem horizontal da página", async () => {
    await p.setViewportSize({ width: 390, height: 800 });
    await p.click("text=☰ Recepção IA");
    await p.click("nav >> text=Pipeline");
    await p.waitForSelector(`text=${titulo}`);
    const larg = await p.evaluate(() => document.documentElement.scrollWidth);
    if (larg > 390) throw new Error(`página com ${larg}px de largura em tela de 390px`);
  });
  if (errosJs.length) throw new Error("Erros JS: " + errosJs.join(" | "));
  await navegador.close();
  console.log(`OK: ${passos.length} passos`);
})().catch(async (e) => {
  // Captura da tela no momento da falha (diagnóstico)
  if (process.env.FALHA_PNG && globalThis.__pagina) await globalThis.__pagina.screenshot({ path: process.env.FALHA_PNG, fullPage: true }).catch(() => {}); console.error("FALHA:", e.message); process.exit(1); });
