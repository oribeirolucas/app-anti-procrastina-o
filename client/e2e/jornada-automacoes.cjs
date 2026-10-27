// E2E das automações (Playwright) contra servidor em execução.
// Uso: BASE_URL=http://localhost:3000 E2E_EMAIL=... E2E_SENHA=... node e2e/jornada-automacoes.cjs
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
const S = Date.now().toString(36);
const passo = async (nome, fn) => { await fn(); console.log("✓", nome); };

(async () => {
  const nav = await chromium.launch();
  const p = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  const errosJs = [];
  p.on("pageerror", (e) => errosJs.push(e.message));
  p.setDefaultTimeout(15000);
  const trpc = (rota, dados) => p.evaluate(async ({ rota, dados }) => {
    const r = await fetch(`/trpc/${rota}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dados) });
    return r.json();
  }, { rota, dados });

  await passo("login", async () => {
    await p.goto(BASE);
    await p.fill("input[type=email]", process.env.E2E_EMAIL);
    await p.fill("input[type=password]", process.env.E2E_SENHA);
    await p.click('button:has-text("Entrar")');
    await p.waitForSelector("text=Painel comercial");
  });

  await passo("criar sequência de follow-up pela interface", async () => {
    await p.click("nav >> text=Automações");
    await p.goto(`${BASE}/automacoes/followup`);
    await p.click("text=+ Sequência");
    await p.fill('label:has-text("Nome *") input', `[E2E] Retomada ${S}`);
    await p.click('.fixed button:has-text("Salvar")');
    await p.waitForSelector("text=Sequência salva.");
  });

  await passo("criar automação: etapa Demonstração → tarefa + aviso + follow-up", async () => {
    await p.goto(`${BASE}/automacoes/regras`);
    await p.click("text=+ Automação");
    await p.fill('label:has-text("Nome *") input', `[E2E] Demo ${S}`);
    await p.selectOption('select[aria-label="Gatilho"]', "oportunidade.etapa_alterada");
    await p.selectOption('label:has-text("Etapa da oportunidade") select', { label: "Demonstração" });
    await p.fill('label:has-text("Título da tarefa") input', "Preparar demo de {oportunidade}");
    await p.click("text=+ Ação");
    await p.fill('label:has-text("Título do aviso") input', "Demo agendada: {oportunidade}");
    await p.click("text=+ Ação");
    const tipos = p.locator('select[aria-label="Tipo de ação"]');
    await tipos.nth(2).selectOption("iniciar_followup");
    await p.selectOption('label:has-text("Sequência") select', { label: `[E2E] Retomada ${S}` });
    await p.click('.fixed button:has-text("Salvar")');
    await p.waitForSelector("text=Automação salva.");
    await p.waitForSelector(`td:has-text("[E2E] Demo ${S}")`);
  });

  let opId;
  await passo("mover oportunidade dispara as ações (tarefa, sininho, follow-up)", async () => {
    const r = await trpc("pipeline.criarOportunidade", { titulo: `[E2E] Op ${S}`, valor: "597" });
    opId = r.result.data.id;
    await p.goto(`${BASE}/oportunidades/${opId}`);
    await p.selectOption('select[aria-label="Etapa"]', { label: "Demonstração" });
    await p.click('button:has-text("Mover para Demonstração")');
    await p.waitForSelector(`text=Preparar demo de [E2E] Op ${S}`);
    await p.waitForSelector(`text=[E2E] Retomada ${S}`); // bloco Follow-up
    await p.click('button[aria-label^="Notificações"]');
    await p.waitForSelector(`text=Demo agendada: [E2E] Op ${S}`);
    await p.keyboard.press("Escape");
  });

  await passo("contato respondeu → follow-up interrompido", async () => {
    await p.reload();
    await p.fill('textarea[placeholder="O que aconteceu?"]', "Respondeu no WhatsApp");
    await p.check("text=O contato respondeu");
    await p.click('button:has-text("Registrar")');
    await p.waitForSelector("text=contato respondeu");
  });

  await passo("formulário público recebe lead e cria oportunidade", async () => {
    const etapas = await trpc("pipeline.etapas", undefined).catch(() => null);
    await p.goto(`${BASE}/automacoes/origens`);
    await p.click("text=+ Origem de captação");
    await p.fill('label:has-text("Nome *") input', `[E2E] Site ${S}`);
    await p.selectOption('label:has-text("Lead entra na etapa") select', { label: "Lead" });
    await p.click('.fixed button:has-text("Criar")');
    await p.waitForSelector(`text=Como usar: [E2E] Site ${S}`);
    const url = await p.locator("pre").first().innerText().then((t) => t.match(/fetch\("([^"]+)"/)[1]);
    const status = await p.evaluate(async (url) => (await fetch(url, { method: "POST", body: new URLSearchParams({ nome: "[E2E] Visitante", email: `visit-${Date.now()}@exemplo.invalid`, mensagem: "Quero agendar" }) })).status, url);
    if (status !== 201) throw new Error(`formulário respondeu ${status}`);
    await p.goto(`${BASE}/pipeline`);
    await p.waitForSelector(`text=[E2E] Visitante — [E2E] Site ${S}`);
    void etapas;
  });

  await passo("execuções registradas", async () => {
    await p.goto(`${BASE}/automacoes/execucoes`);
    await p.waitForSelector(`td:has-text("[E2E] Demo ${S}")`);
  });

  if (errosJs.length) throw new Error("Erros JS: " + errosJs.join(" | "));
  await nav.close();
  console.log("OK");
})().catch((e) => { console.error("FALHA:", e.message.split("\n")[0]); process.exit(1); });
