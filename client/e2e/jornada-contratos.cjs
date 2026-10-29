// E2E da aba Contratos (Playwright) contra servidor em execução.
// Uso: BASE_URL=http://localhost:3000 E2E_EMAIL=... E2E_SENHA=... node e2e/jornada-contratos.cjs
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const S = Date.now().toString(36);
const passo = async (nome, fn) => { await fn(); console.log("✓", nome); };

(async () => {
  const nav = await chromium.launch();
  const p = (globalThis.__pagina = await nav.newPage({ viewport: { width: 1280, height: 900 } }));
  const errosJs = [];
  p.on("pageerror", (e) => errosJs.push(e.message));
  p.setDefaultTimeout(15000);
  const trpc = (rota, dados, metodo = "POST") => p.evaluate(async ({ rota, dados, metodo }) => {
    const r = metodo === "GET"
      ? await fetch(`/trpc/${rota}?input=${encodeURIComponent(JSON.stringify(dados))}`)
      : await fetch(`/trpc/${rota}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) });
    return (await r.json()).result.data;
  }, { rota, dados, metodo });
  const empresa = `[E2E] Clínica Contrato ${S}`;
  const titulo = `[E2E] Venda ${S}`;

  await passo("login", async () => {
    await p.goto(BASE);
    await p.fill("input[type=email]", process.env.E2E_EMAIL);
    await p.fill("input[type=password]", process.env.E2E_SENHA);
    await p.click('button:has-text("Entrar")');
    await p.waitForSelector("text=Painel comercial");
  });

  await passo("venda ganha aparece como 'sem contrato'", async () => {
    const e = await trpc("cadastros.criarEmpresa", { nome: empresa, cidade: "E2E" });
    const o = await trpc("pipeline.criarOportunidade", { titulo, empresaId: e.id, valor: "897" });
    const etapas = await trpc("pipeline.etapas", undefined, "GET");
    await trpc("pipeline.moverEtapa", { id: o.id, versao: o.versao, etapaId: etapas.find((x) => x.tipo === "ganha").id });
    await p.click("nav >> text=Contratos");
    await p.waitForSelector(`li:has-text("${titulo}")`);
  });

  await passo("criar contrato a partir da venda (formulário já preenchido)", async () => {
    await p.click(`li:has-text("${titulo}") >> text=Criar contrato`);
    const valor = await p.inputValue('label:has-text("Mensalidade") input');
    if (valor !== "897,00") throw new Error(`mensalidade não veio da venda: ${valor}`);
    // "Personalizado" não tem preço de tabela: mantém o valor negociado na venda
    await p.selectOption('label:has-text("Plano") select', "Personalizado");
    if ((await p.inputValue('label:has-text("Mensalidade") input')) !== "897,00") throw new Error("Personalizado trocou a mensalidade");
    await p.click('.fixed button:has-text("Salvar")');
    await p.waitForSelector("text=Contrato registrado.");
    await p.waitForSelector(`td:has-text("${empresa}")`);
    if (await p.locator(`li:has-text("${titulo}")`).count()) throw new Error("venda continua sem contrato");
  });

  await passo("abrir detalhe e renovar com reajuste", async () => {
    await p.click(`tr:has-text("${empresa}")`);
    await p.waitForSelector("text=Histórico do contrato");
    await p.click('button:has-text("Renovar")');
    await p.fill('label:has-text("Nova mensalidade") input', "949,90");
    await p.click('button:has-text("Confirmar renovação")');
    await p.waitForSelector("text=/Renovado até/");
    await p.waitForSelector("text=R$ 949,90");
  });

  await passo("suspender com motivo e reativar", async () => {
    await p.click('button:has-text("Suspender")');
    await p.fill('label:has-text("Motivo") input', "Clínica em reforma");
    await p.click('form button:has-text("Suspender")');
    await p.waitForSelector("text=Motivo: Clínica em reforma");
    await p.click('button:has-text("Reativar")');
    await p.waitForSelector("text=Contrato reativado.");
  });

  await passo("cancelar (definitivo) e encontrar pelo filtro", async () => {
    await p.click('button:has-text("Cancelar contrato")');
    await p.fill('label:has-text("Motivo") input', "Trocou de fornecedor");
    await p.click('form button:has-text("Cancelar contrato")');
    await p.waitForSelector("text=Contrato cancelado.");
    if (await p.locator('button:has-text("Editar")').count()) throw new Error("contrato cancelado ainda editável");
    await p.keyboard.press("Escape");
    await p.selectOption('label:has-text("Situação") select', "cancelado");
    await p.fill('label:has-text("Buscar empresa") input', S);
    await p.waitForSelector(`tr:has-text("${empresa}") >> text=cancelado`);
  });

  await passo("celular: aba sem rolagem horizontal da página", async () => {
    await p.setViewportSize({ width: 390, height: 800 });
    await p.goto(`${BASE}/contratos`);
    await p.waitForSelector("text=Receita mensal ativa");
    const larg = await p.evaluate(() => document.documentElement.scrollWidth);
    if (larg > 390) throw new Error(`página com ${larg}px em tela de 390px`);
    if (process.env.SCREENSHOT) await p.screenshot({ path: process.env.SCREENSHOT.replace(".png", "-mobile.png"), fullPage: true });
  });

  if (process.env.SCREENSHOT) {
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.goto(`${BASE}/contratos?situacao=todos`);
    await p.waitForSelector("text=Receita mensal ativa");
    await p.screenshot({ path: process.env.SCREENSHOT, fullPage: true });
  }
  if (errosJs.length) throw new Error("Erros JS: " + errosJs.join(" | "));
  await nav.close();
  console.log("OK");
})().catch(async (e) => {
  // Captura da tela no momento da falha (diagnóstico)
  if (process.env.FALHA_PNG && globalThis.__pagina) await globalThis.__pagina.screenshot({ path: process.env.FALHA_PNG, fullPage: true }).catch(() => {}); console.error("FALHA:", e.message.split("\n")[0]); process.exit(1); });
