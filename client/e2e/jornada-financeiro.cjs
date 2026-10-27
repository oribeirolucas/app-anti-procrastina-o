// E2E do financeiro (Playwright) contra servidor em execução. Usa um admin e cria um operador [E2E].
// Uso: BASE_URL=http://localhost:3000 E2E_EMAIL=... E2E_SENHA=... node e2e/jornada-financeiro.cjs
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SUFIXO = Date.now().toString(36);
const passo = async (nome, fn) => { await fn(); console.log("✓", nome); };

async function entrar(p, email, senha) {
  await p.goto(BASE);
  await p.fill("input[type=email]", email);
  await p.fill("input[type=password]", senha);
  await p.click('button:has-text("Entrar")');
  await p.waitForSelector("text=Painel comercial");
}

(async () => {
  const nav = await chromium.launch();
  const p = (globalThis.__pagina = await nav.newPage({ viewport: { width: 1280, height: 900 } }));
  const errosJs = [];
  p.on("pageerror", (e) => errosJs.push(e.message));
  p.setDefaultTimeout(10000);
  const desc = `[E2E] VPS ${SUFIXO}`;

  await passo("login admin", () => entrar(p, process.env.E2E_EMAIL, process.env.E2E_SENHA));
  await passo("criar despesa pendente", async () => {
    await p.click("nav >> text=Financeiro");
    await p.click("text=Lançamentos");
    await p.click("text=+ Lançamento");
    await p.fill('label:has-text("Descrição *") input', desc);
    await p.selectOption('label:has-text("Categoria *") select', { label: "Infraestrutura" });
    await p.fill('label:has-text("Valor (R$) *") input', "28,49");
    await p.click('.fixed button:has-text("Salvar")');
    await p.waitForSelector("text=Lançamento criado.");
    await p.fill('label:has-text("Buscar") input', SUFIXO);
    await p.waitForSelector(`tr:has-text("${desc}") >> text=pendente`);
  });
  await passo("baixar com valor diferente (diferença visível)", async () => {
    await p.click(`tr:has-text("${desc}") >> text=Baixar`);
    await p.fill('label:has-text("Valor pago") input', "30,00");
    await p.click('button:has-text("Confirmar baixa")');
    await p.waitForSelector("text=Baixa registrada.");
    await p.waitForSelector(`tr:has-text("${desc}") >> text=(+R$ 1,51)`);
  });
  await passo("painel mostra a despesa paga e rastreia até a lista", async () => {
    await p.goto(`${BASE}/financeiro/painel`);
    await p.waitForSelector("text=Fluxo de caixa mês a mês");
    await p.click('a:has-text("despesas pagas")');
    await p.waitForURL(/situacao=pago/);
    await p.waitForSelector(`text=${desc}`);
  });
  await passo("gerar cobranças duas vezes não duplica", async () => {
    await p.click("text=Gerar cobranças do mês");
    await p.click('.fixed button:has-text("Gerar")');
    await p.waitForSelector("text=/cobranças criadas/");
    await p.waitForTimeout(4500); // aviso some
    await p.click("text=Gerar cobranças do mês");
    await p.click('.fixed button:has-text("Gerar")');
    await p.waitForSelector("text=/^0 cobranças criadas/");
  });
  await passo("operador não vê o financeiro (menu e URL)", async () => {
    const email = `e2e-op-${SUFIXO}@exemplo.invalid`;
    const r = await p.evaluate(async ({ email }) => {
      const res = await fetch("/trpc/admin.criarUsuario", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome: "[E2E] Operador", email, perfil: "operador", senha: "OperadorE2E123" }) });
      return res.status;
    }, { email });
    if (r !== 200) throw new Error(`criar operador: HTTP ${r}`);
    const ctx2 = await nav.newContext();
    const p2 = await ctx2.newPage();
    await entrar(p2, email, "OperadorE2E123");
    if (await p2.locator("nav >> text=Financeiro").count()) throw new Error("operador vê o menu Financeiro");
    await p2.goto(`${BASE}/financeiro/painel`);
    await p2.waitForSelector("text=Painel comercial"); // redirecionado
    await ctx2.close();
  });
  await p.goto(`${BASE}/financeiro/painel`);
  await p.waitForSelector("text=Fluxo de caixa mês a mês");
  await p.screenshot({ path: process.env.SCREENSHOT || "/dev/null", fullPage: true }).catch(() => {});
  if (errosJs.length) throw new Error("Erros JS: " + errosJs.join(" | "));
  await nav.close();
  console.log("OK");
})().catch(async (e) => {
  // Captura da tela no momento da falha (diagnóstico)
  if (process.env.FALHA_PNG && globalThis.__pagina) await globalThis.__pagina.screenshot({ path: process.env.FALHA_PNG, fullPage: true }).catch(() => {}); console.error("FALHA:", e.message); process.exit(1); });
