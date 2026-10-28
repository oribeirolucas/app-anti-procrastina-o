// Aplica o perfil de uma empresa (nome, planos, base de conhecimento e agentes) numa instalação, pela API.
// Idempotente: planos e agentes são atualizados pelo nome; nada é apagado.
// Uso: BASE_URL=https://crm.cliente.com.br E2E_EMAIL=admin@... E2E_SENHA=... node deploy/scripts/aplicar-perfil.mjs empresa/perfil-crm.json [--aplicar]
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL;
const arquivo = process.argv[2];
const aplicar = process.argv.includes("--aplicar");
if (!BASE || !arquivo || !process.env.E2E_EMAIL || !process.env.E2E_SENHA) {
  console.error("Uso: BASE_URL=... E2E_EMAIL=... E2E_SENHA=... node aplicar-perfil.mjs <perfil.json> [--aplicar]");
  process.exit(1);
}
const perfil = JSON.parse(readFileSync(arquivo, "utf8"));

let cookie = "";
async function chamar(rota, dados, metodo = "POST") {
  const url = metodo === "GET" ? `${BASE}/trpc/${rota}?input=${encodeURIComponent(JSON.stringify(dados ?? {}))}` : `${BASE}/trpc/${rota}`;
  const r = await fetch(url, { method: metodo, headers: { "content-type": "application/json", origin: BASE, cookie }, body: metodo === "GET" ? undefined : JSON.stringify(dados) });
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const j = await r.json();
  if (j.error) throw new Error(`${rota}: ${j.error.message}`);
  return j.result.data;
}
const passo = async (descricao, fn) => { console.log(`${aplicar ? "→" : "(simulação)"} ${descricao}`); if (aplicar) await fn(); };

await chamar("auth.login", { email: process.env.E2E_EMAIL, senha: process.env.E2E_SENHA });

await passo(`nome da empresa: ${perfil.nomeEmpresa}`, () => chamar("admin.salvarConfiguracao", { chave: "nome_empresa", valor: perfil.nomeEmpresa }));

const planos = await chamar("planos.listar", { incluirInativos: true }, "GET");
for (const p of perfil.planos) {
  const atual = planos.find((x) => x.nome.toLowerCase() === p.nome.toLowerCase());
  const dados = { nome: p.nome, valorMensal: p.valorMensal, valorSetup: p.valorSetup, descricao: p.descricao ?? null, ordem: p.ordem ?? 0, ativo: true };
  await passo(`plano ${p.nome} (${atual ? "atualizar" : "criar"}): R$ ${p.valorMensal}/mês, setup R$ ${p.valorSetup}`,
    () => (atual ? chamar("planos.atualizar", { ...dados, id: atual.id, versao: atual.versao }) : chamar("planos.criar", dados)));
}

await passo(`base de conhecimento (${perfil.baseConhecimento.length} caracteres)`, () => chamar("agentes.salvarBaseConhecimento", { texto: perfil.baseConhecimento }));

const agentes = await chamar("agentes.listar", undefined, "GET");
for (const a of perfil.agentes) {
  const atual = agentes.find((x) => x.nome.toLowerCase() === a.nome.toLowerCase());
  const dados = { nome: a.nome, area: a.area, systemPrompt: a.systemPrompt, provedor: "anthropic", modelo: a.modelo, ativo: a.ativo };
  await passo(`agente ${a.nome} [${a.area}] (${atual ? "atualizar" : "criar"}), ${a.ativo ? "ativo" : "inativo"}`,
    () => (atual ? chamar("agentes.salvar", { ...dados, id: atual.id, versao: atual.versao }) : chamar("agentes.salvar", dados)));
  // Um agente ativo por área: os outros ativos da mesma área são desativados para o roteador não escolher o errado
  if (a.ativo) for (const outro of agentes.filter((x) => x.area === a.area && x.ativo && x.nome.toLowerCase() !== a.nome.toLowerCase())) {
    await passo(`  desativar ${outro.nome} (mesma área)`, () => chamar("agentes.salvar", { nome: outro.nome, area: outro.area, systemPrompt: outro.systemPrompt, provedor: outro.provedor, modelo: outro.modelo, ativo: false, id: outro.id, versao: outro.versao }));
  }
}
console.log(aplicar ? "Perfil aplicado." : "Simulação concluída. Rode com --aplicar para gravar.");
