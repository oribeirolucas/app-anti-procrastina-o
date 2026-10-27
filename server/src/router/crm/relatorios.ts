import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { contato, contrato, empresa, etapaPipeline, oportunidade, tarefa, usuario } from "../../db/schema.js";
import { auditar } from "../../lib/auditoria.js";
import { gerarCsv, parseCsv } from "../../lib/csv.js";
import { intervaloDoPeriodo, obterFuso } from "../../lib/datas.js";
import { deCentavos, paraCentavos } from "../../lib/dinheiro.js";
import { comPermissao, router } from "../trpc.js";
import { contatoInput, empresaInput } from "./cadastros.js";

const periodo = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Fórmulas documentadas em docs/INDICADORES.md
export async function indicadoresComerciais(de: string, ate: string) {
  const { inicio, fimExclusivo } = intervaloDoPeriodo(de, ate, await obterFuso());

  const porEtapa = await db
    .select({
      etapaId: etapaPipeline.id,
      etapa: etapaPipeline.nome,
      probabilidade: etapaPipeline.probabilidade,
      quantidade: sql<number>`count(${oportunidade.id})::int`,
      valor: sql<string>`coalesce(sum(${oportunidade.valor}), 0)::text`,
    })
    .from(etapaPipeline)
    .leftJoin(oportunidade, and(eq(oportunidade.etapaId, etapaPipeline.id), eq(oportunidade.situacao, "aberta"), isNull(oportunidade.arquivadoEm)))
    .where(and(eq(etapaPipeline.ativa, true), eq(etapaPipeline.tipo, "aberta")))
    .groupBy(etapaPipeline.id)
    .orderBy(asc(etapaPipeline.ordem));

  const encerradas = await db
    .select({ situacao: oportunidade.situacao, quantidade: sql<number>`count(*)::int`, valor: sql<string>`coalesce(sum(${oportunidade.valor}),0)::text` })
    .from(oportunidade)
    .where(and(gte(oportunidade.fechadaEm, inicio), lt(oportunidade.fechadaEm, fimExclusivo)))
    .groupBy(oportunidade.situacao);
  const ganhas = encerradas.find((e) => e.situacao === "ganha") ?? { quantidade: 0, valor: "0" };
  const perdidas = encerradas.find((e) => e.situacao === "perdida") ?? { quantidade: 0, valor: "0" };

  const [{ novas }] = await db
    .select({ novas: sql<number>`count(*)::int` })
    .from(oportunidade)
    .where(and(gte(oportunidade.criadoEm, inicio), lt(oportunidade.criadoEm, fimExclusivo)));

  const [{ atrasadas }] = await db
    .select({ atrasadas: sql<number>`count(*)::int` })
    .from(tarefa)
    .where(and(eq(tarefa.concluida, false), lte(tarefa.venceEm, new Date())));

  const [{ mrrContratado }] = await db
    .select({ mrrContratado: sql<string>`coalesce(sum(${contrato.valorMensal}),0)::text` })
    .from(contrato)
    .where(eq(contrato.situacao, "ativo"));

  const pipelineTotal = porEtapa.reduce((a, e) => a + paraCentavos(e.valor), 0);
  const pipelinePonderado = porEtapa.reduce((a, e) => a + Math.round((paraCentavos(e.valor) * e.probabilidade) / 100), 0);
  const decididas = ganhas.quantidade + perdidas.quantidade;

  return {
    porEtapa,
    pipelineAberto: deCentavos(pipelineTotal),
    pipelinePonderado: deCentavos(pipelinePonderado),
    novas,
    ganhas,
    perdidas,
    taxaConversao: decididas ? ganhas.quantidade / decididas : null,
    ticketMedio: ganhas.quantidade ? deCentavos(Math.round(paraCentavos(ganhas.valor) / ganhas.quantidade)) : null,
    tarefasAtrasadas: atrasadas,
    mrrContratado,
  };
}

type Erro = { linha: number; erro: string };
const chaveEmpresa = (e: { nome: string; cidade?: string | null }) => `${e.nome.toLowerCase()}|${(e.cidade ?? "").toLowerCase()}`;

export const relatoriosRouter = router({
  indicadores: comPermissao("crm:ler")
    .input(periodo)
    .query(({ input }) => indicadoresComerciais(input.de, input.ate)),

  exportar: comPermissao("crm:exportar")
    .input(z.object({ entidade: z.enum(["empresas", "contatos", "oportunidades"]) }))
    .mutation(async ({ ctx, input }) => {
      let csv: string;
      if (input.entidade === "empresas") {
        const r = await db.select().from(empresa).orderBy(asc(empresa.nome));
        csv = gerarCsv(["nome", "documento", "segmento", "cidade", "uf", "telefone", "site", "observacoes"], r.map((e) => [e.nome, e.documento, e.segmento, e.cidade, e.uf, e.telefone, e.site, e.observacoes]));
      } else if (input.entidade === "contatos") {
        const r = await db.select({ c: contato, empresa: empresa.nome }).from(contato).leftJoin(empresa, eq(empresa.id, contato.empresaId)).orderBy(asc(contato.nome));
        csv = gerarCsv(["nome", "email", "telefone", "cargo", "empresa", "descadastrado"], r.map(({ c, empresa }) => [c.nome, c.email, c.telefone, c.cargo, empresa, c.descadastrado ? "sim" : "nao"]));
      } else {
        const r = await db
          .select({ o: oportunidade, empresa: empresa.nome, etapa: etapaPipeline.nome, responsavel: usuario.nome })
          .from(oportunidade)
          .innerJoin(etapaPipeline, eq(etapaPipeline.id, oportunidade.etapaId))
          .leftJoin(empresa, eq(empresa.id, oportunidade.empresaId))
          .leftJoin(usuario, eq(usuario.id, oportunidade.responsavelId));
        csv = gerarCsv(
          ["titulo", "empresa", "etapa", "situacao", "valor", "origem", "responsavel", "previsao_fechamento", "criado_em", "fechada_em"],
          r.map(({ o, empresa, etapa, responsavel }) => [o.titulo, empresa, etapa, o.situacao, o.valor.replace(".", ","), o.origem, responsavel, o.previsaoFechamento, o.criadoEm, o.fechadaEm]),
        );
      }
      await auditar(ctx.usuario.id, "csv.exportar", input.entidade);
      return { nomeArquivo: `${input.entidade}-${new Date().toISOString().slice(0, 10)}.csv`, conteudo: csv };
    }),

  // Validação completa antes de gravar: com simular=true nada é persistido.
  importar: comPermissao("crm:importar")
    .input(z.object({ entidade: z.enum(["empresas", "contatos"]), conteudo: z.string().max(5_000_000), simular: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const linhas = parseCsv(input.conteudo);
      if (linhas.length < 2) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio ou sem linhas de dados." });
      if (linhas.length > 5001) throw new TRPCError({ code: "BAD_REQUEST", message: "Limite de 5.000 linhas por importação." });
      const cab = linhas[0].map((c) => c.trim().toLowerCase());
      if (!cab.includes("nome")) throw new TRPCError({ code: "BAD_REQUEST", message: 'Cabeçalho precisa ter a coluna "nome".' });
      const registros = linhas.slice(1).map((l) => Object.fromEntries(cab.map((c, i) => [c, (l[i] ?? "").trim()])));

      const erros: Erro[] = [];
      const validos: Array<{ linha: number; dados: Record<string, unknown> }> = [];
      const schema = input.entidade === "empresas" ? empresaInput : contatoInput.omit({ empresaId: true }).extend({ empresa: z.string().optional() });
      const vistos = new Set<string>();
      registros.forEach((r, i) => {
        const res = schema.safeParse(r);
        const linha = i + 2;
        if (!res.success) {
          erros.push({ linha, erro: res.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
          return;
        }
        const chave = input.entidade === "empresas" ? chaveEmpresa(res.data as { nome: string; cidade?: string | null }) : ((res.data as { email?: string | null }).email ?? `${linha}`);
        if (vistos.has(chave)) { erros.push({ linha, erro: "Registro duplicado no arquivo." }); return; }
        vistos.add(chave);
        validos.push({ linha, dados: res.data as Record<string, unknown> });
      });

      // Duplicados já existentes no banco
      if (input.entidade === "empresas") {
        const nomes = validos.map((v) => String(v.dados.nome).toLowerCase());
        const existentes = new Set(nomes.length ? (await db.select({ nome: empresa.nome, cidade: empresa.cidade }).from(empresa).where(inArray(sql`lower(${empresa.nome})`, nomes))).map(chaveEmpresa) : []);
        for (let i = validos.length - 1; i >= 0; i--)
          if (existentes.has(chaveEmpresa(validos[i].dados as { nome: string; cidade?: string | null }))) { erros.push({ linha: validos[i].linha, erro: "Empresa já cadastrada nesta cidade (ignorada)." }); validos.splice(i, 1); }
        const docs = validos.map((v) => v.dados.documento).filter((d): d is string => typeof d === "string");
        const docsExistentes = new Set(docs.length ? (await db.select({ d: empresa.documento }).from(empresa).where(inArray(empresa.documento, docs))).map((e) => e.d) : []);
        const docsArquivo = new Set<string>();
        for (let i = 0; i < validos.length; i++) {
          const d = validos[i].dados.documento as string | null;
          if (d && (docsExistentes.has(d) || docsArquivo.has(d))) { erros.push({ linha: validos[i].linha, erro: "CNPJ já cadastrado ou repetido (ignorada)." }); validos.splice(i--, 1); }
          else if (d) docsArquivo.add(d);
        }
      } else {
        const emails = validos.map((v) => v.dados.email).filter((e): e is string => typeof e === "string");
        const existentes = new Set(emails.length ? (await db.select({ email: contato.email }).from(contato).where(inArray(contato.email, emails))).map((c) => c.email) : []);
        for (let i = validos.length - 1; i >= 0; i--)
          if (validos[i].dados.email && existentes.has(String(validos[i].dados.email))) { erros.push({ linha: validos[i].linha, erro: "E-mail já cadastrado (ignorado)." }); validos.splice(i, 1); }
      }

      // Contatos: o nome da empresa precisa apontar para no máximo uma empresa (pode haver homônimas em cidades diferentes)
      if (input.entidade === "contatos") {
        const nomesEmp = [...new Set(validos.map((v) => String(v.dados.empresa ?? "").toLowerCase()).filter(Boolean))];
        const contagem = new Map<string, number>();
        if (nomesEmp.length)
          for (const e of await db.select({ nome: empresa.nome }).from(empresa).where(inArray(sql`lower(${empresa.nome})`, nomesEmp)))
            contagem.set(e.nome.toLowerCase(), (contagem.get(e.nome.toLowerCase()) ?? 0) + 1);
        for (let i = validos.length - 1; i >= 0; i--) {
          const n = String(validos[i].dados.empresa ?? "").toLowerCase();
          if (n && (contagem.get(n) ?? 0) > 1) { erros.push({ linha: validos[i].linha, erro: "Há mais de uma empresa com este nome (cidades diferentes): vincule o contato manualmente." }); validos.splice(i, 1); }
        }
      }

      erros.sort((a, b) => a.linha - b.linha);
      if (input.simular) return { simulado: true, total: registros.length, validos: validos.length, erros };

      await db.transaction(async (tx) => {
        if (input.entidade === "empresas") {
          if (validos.length) await tx.insert(empresa).values(validos.map((v) => ({ ...(v.dados as z.infer<typeof empresaInput>), responsavelId: ctx.usuario.id })));
        } else {
          const nomesEmpresas = [...new Set(validos.map((v) => String(v.dados.empresa ?? "").toLowerCase()).filter(Boolean))];
          const mapa = new Map(nomesEmpresas.length ? (await tx.select({ id: empresa.id, nome: empresa.nome }).from(empresa).where(inArray(sql`lower(${empresa.nome})`, nomesEmpresas))).map((e) => [e.nome.toLowerCase(), e.id]) : []);
          for (const v of validos) {
            const { empresa: nomeEmpresa, ...c } = v.dados as { empresa?: string } & z.infer<typeof contatoInput>;
            let empresaId: string | null = null;
            if (nomeEmpresa) {
              empresaId = mapa.get(nomeEmpresa.toLowerCase()) ?? null;
              if (!empresaId) {
                const [nova] = await tx.insert(empresa).values({ nome: nomeEmpresa, responsavelId: ctx.usuario.id }).returning({ id: empresa.id });
                empresaId = nova.id;
                mapa.set(nomeEmpresa.toLowerCase(), empresaId);
              }
            }
            await tx.insert(contato).values({ ...c, empresaId });
          }
        }
      });
      await auditar(ctx.usuario.id, "csv.importar", input.entidade, undefined, { importados: validos.length, erros: erros.length });
      return { simulado: false, total: registros.length, validos: validos.length, erros };
    }),
});
