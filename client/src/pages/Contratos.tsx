import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { trpc, type Saidas } from "../lib/trpc";
import { data, dataHora, moeda } from "../lib/formato";
import { usePode } from "../lib/sessao";
import { useAvisar } from "../lib/aviso";
import { Botao, Campo, Carregando, Cartao, Erro, Etiqueta, Indicador, Modal, Pagina, Selecao, Tabela, Vazio } from "../components/ui";
import { FormContrato, type PreenchimentoContrato } from "../components/FormContrato";

type Linha = Saidas["contratos"]["listar"][number];

const diasAte = (fim: string, hoje: string) => Math.round((Date.parse(fim) - Date.parse(hoje)) / 86400_000);

function Vigencia({ c }: { c: { inicio: string; fim: string | null; situacao: string; hoje: string } }) {
  if (!c.fim) return <span>{data(c.inicio)} → <span className="text-slate-500">indeterminado</span></span>;
  const d = diasAte(c.fim, c.hoje);
  const alerta = c.situacao === "ativo" && (d < 0 ? <Etiqueta valor="perdida" texto={`vencido há ${-d} dias`} /> : d <= 30 ? <Etiqueta valor="suspenso" texto={d === 0 ? "vence hoje" : `vence em ${d} dias`} /> : null);
  return <span className="whitespace-nowrap">{data(c.inicio)} → {data(c.fim)} {alerta}</span>;
}

function Financeiro({ c }: { c: { recebido: string; emAtraso: string; cobrancasAtrasadas: number; proximaCobranca: string | null } }) {
  return (
    <div className="text-xs leading-5">
      <div>Recebido {moeda(c.recebido)}</div>
      {Number(c.emAtraso) > 0
        ? <div className="font-medium text-red-600">Em atraso {moeda(c.emAtraso)} ({c.cobrancasAtrasadas})</div>
        : <div className="text-emerald-700">Em dia</div>}
      {c.proximaCobranca && <div className="text-slate-500">Próx. cobrança {data(c.proximaCobranca)}</div>}
    </div>
  );
}

function Detalhe({ id, aoFechar, aoEditar }: { id: string; aoFechar: () => void; aoEditar: (c: Saidas["contratos"]["obter"]) => void }) {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const podeEscrever = usePode("contratos:escrever");
  const podeFinanceiro = usePode("financeiro:ler");
  const q = trpc.contratos.obter.useQuery({ id });
  const [acao, setAcao] = useState<"renovar" | "suspenso" | "cancelado" | null>(null);
  const [meses, setMeses] = useState("12");
  const [novoValor, setNovoValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [cancelarFuturas, setCancelarFuturas] = useState(true);
  const fechar = () => { setAcao(null); setMotivo(""); setNovoValor(""); };
  // Aplica na hora o contrato devolvido pelo servidor (versão nova) antes de recarregar:
  // sem isso, uma segunda ação feita antes do recarregamento iria com versão antiga e daria conflito.
  const aplicar = (novo: { versao: number; situacao: string; fim: string | null; valorMensal: string; motivoSituacao: string | null }) => {
    utils.contratos.obter.setData({ id }, (v) => (v ? { ...v, ...novo } : v));
    void utils.contratos.invalidate();
  };
  const renovar = trpc.contratos.renovar.useMutation({ onSuccess: (c) => { aplicar(c); avisar(`Renovado até ${data(c.fim)}.`); fechar(); } });
  const situacao = trpc.contratos.alterarSituacao.useMutation({
    onSuccess: (r) => { aplicar(r.contrato); void utils.financeiro.invalidate(); avisar(`Contrato ${r.contrato.situacao === "ativo" ? "reativado" : r.contrato.situacao}.${r.cobrancasCanceladas ? ` ${r.cobrancasCanceladas} cobrança(s) futura(s) cancelada(s).` : ""}`); fechar(); },
  });
  const c = q.data;
  const ocupado = renovar.isPending || situacao.isPending || q.isFetching;
  const ROTULO_ACAO: Record<string, string> = { "contrato.criar": "Registrado", "contrato.atualizar": "Editado", "contrato.renovar": "Renovado", "contrato.suspender": "Suspenso", "contrato.reativar": "Reativado", "contrato.cancelar": "Cancelado" };

  return (
    <Modal titulo={c ? `${c.empresa} · ${c.plano}` : "Contrato"} aberto aoFechar={aoFechar} largura="max-w-3xl">
      {q.isLoading ? <Carregando /> : !c ? <Erro erro={q.error} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Etiqueta valor={c.situacao} />
            {c.motivoSituacao && <span className="text-slate-600">Motivo: {c.motivoSituacao}</span>}
            <Link to={`/empresas/${c.empresaId}`} className="text-indigo-700 hover:underline">ver empresa</Link>
            {c.oportunidadeId && <Link to={`/oportunidades/${c.oportunidadeId}`} className="text-indigo-700 hover:underline">venda: {c.oportunidade}</Link>}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Indicador rotulo="Mensalidade" valor={moeda(c.valorMensal)} detalhe={Number(c.valorSetup) > 0 ? `Setup ${moeda(c.valorSetup)}` : "Sem setup"} />
            <Indicador rotulo="Vigência" valor={<span className="text-base"><Vigencia c={c} /></span>} detalhe={`Cobrança todo dia ${c.diaVencimento}`} />
            <Indicador rotulo="Recebido" valor={moeda(c.recebido)} detalhe={`Faturado ${moeda(c.faturado)}`} />
            <Indicador rotulo="Em atraso" valor={<span className={Number(c.emAtraso) > 0 ? "text-red-600" : ""}>{moeda(c.emAtraso)}</span>} detalhe={c.proximaCobranca ? `Próxima ${data(c.proximaCobranca)}` : "Nenhuma cobrança futura"} />
          </div>
          {c.observacoes && <p className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-sm text-slate-700">{c.observacoes}</p>}

          {podeEscrever && c.situacao !== "cancelado" && !acao && (
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" disabled={ocupado} onClick={() => aoEditar(c)}>Editar</Botao>
              {c.fim && <Botao variante="secundario" disabled={ocupado} onClick={() => { setAcao("renovar"); setNovoValor(c.valorMensal.replace(".", ",")); }}>Renovar</Botao>}
              {c.situacao === "ativo"
                ? <Botao variante="secundario" disabled={ocupado} onClick={() => setAcao("suspenso")}>Suspender</Botao>
                : <Botao variante="secundario" disabled={ocupado} carregando={situacao.isPending} onClick={() => situacao.mutate({ id: c.id, versao: c.versao, situacao: "ativo" })}>Reativar</Botao>}
              <Botao variante="perigo" disabled={ocupado} onClick={() => setAcao("cancelado")}>Cancelar contrato</Botao>
            </div>
          )}
          {acao === "renovar" && (
            <form className="space-y-3 rounded-md border border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); renovar.mutate({ id: c.id, versao: c.versao, meses: Number(meses), novoValorMensal: novoValor || undefined }); }}>
              <p className="text-sm font-medium">Renovar a partir de {data(c.fim! < c.hoje ? c.hoje : c.fim)}</p>
              <div className="grid grid-cols-2 gap-3">
                <Selecao rotulo="Por quanto tempo" value={meses} onChange={(e) => setMeses(e.target.value)}>{["1", "3", "6", "12", "24"].map((m) => <option key={m} value={m}>{m} {m === "1" ? "mês" : "meses"}</option>)}</Selecao>
                <Campo rotulo="Nova mensalidade (R$)" inputMode="decimal" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} />
              </div>
              <Erro erro={renovar.error} />
              <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={fechar}>Voltar</Botao><Botao carregando={renovar.isPending}>Confirmar renovação</Botao></div>
            </form>
          )}
          {(acao === "suspenso" || acao === "cancelado") && (
            <form className="space-y-3 rounded-md border border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); situacao.mutate({ id: c.id, versao: c.versao, situacao: acao, motivo, cancelarCobrancasFuturas: cancelarFuturas }); }}>
              <p className="text-sm">{acao === "suspenso"
                ? "Suspenso: o contrato deixa de gerar cobranças até ser reativado."
                : <>Cancelar é <b>definitivo</b>: para voltar, registre um novo contrato. Cobranças já vencidas continuam em aberto.</>}</p>
              <Campo rotulo="Motivo *" required minLength={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={acao === "suspenso" ? "Ex.: clínica em reforma" : "Ex.: fechou a unidade, trocou de fornecedor"} />
              {acao === "cancelado" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cancelarFuturas} onChange={(e) => setCancelarFuturas(e.target.checked)} /> Cancelar também as cobranças futuras pendentes</label>}
              <Erro erro={situacao.error} />
              <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={fechar}>Voltar</Botao><Botao variante={acao === "cancelado" ? "perigo" : "primario"} carregando={situacao.isPending}>{acao === "suspenso" ? "Suspender" : "Cancelar contrato"}</Botao></div>
            </form>
          )}

          <Cartao titulo="Cobranças" acoes={podeFinanceiro && <Link className="text-xs text-indigo-700 hover:underline" to={`/financeiro/lancamentos?busca=${encodeURIComponent(c.empresa)}`}>abrir no financeiro</Link>}>
            {!c.cobrancas.length ? <Vazio texto="Nenhuma cobrança gerada ainda. Use Financeiro → Gerar cobranças do mês." /> : (
              <Tabela colunas={["Vencimento", "Descrição", "Valor", "Situação", "Pago em"]}>
                {c.cobrancas.map((l) => {
                  const atrasada = l.situacao === "pendente" && l.vencimento < c.hoje;
                  return (
                    <tr key={l.id} className={l.situacao === "cancelado" ? "text-slate-400" : ""}>
                      <td className={`px-3 py-1 ${atrasada ? "font-medium text-red-600" : ""}`}>{data(l.vencimento)}</td>
                      <td className="px-3 py-1 text-xs">{l.descricao}</td><td className="px-3 py-1">{moeda(l.valor)}</td>
                      <td className="px-3 py-1">{atrasada ? <Etiqueta valor="perdida" texto="em atraso" /> : <Etiqueta valor={l.situacao === "pago" ? "ativo" : l.situacao === "cancelado" ? "cancelado" : "suspenso"} texto={l.situacao} />}</td>
                      <td className="px-3 py-1">{data(l.pagoEm)}</td>
                    </tr>
                  );
                })}
              </Tabela>
            )}
          </Cartao>
          <Cartao titulo="Histórico do contrato">
            <ul className="space-y-1 text-xs">{c.eventos.map((e, i) => (
              <li key={i}><b>{ROTULO_ACAO[e.acao] ?? e.acao}</b> · {dataHora(e.criadoEm)} · {e.usuario ?? "sistema"}
                {!!e.detalhes && e.acao !== "contrato.criar" && <span className="text-slate-500"> · {Object.entries(e.detalhes as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}: ${typeof v === "object" ? `${(v as { de: unknown }).de} → ${(v as { para: unknown }).para}` : v}`).join("; ")}</span>}
              </li>
            ))}</ul>
          </Cartao>
        </div>
      )}
    </Modal>
  );
}

export default function Contratos() {
  const podeEscrever = usePode("contratos:escrever");
  const [sp, setSp] = useSearchParams();
  const filtros = { busca: sp.get("busca") ?? "", situacao: sp.get("situacao") ?? "ativo", vencimento: sp.get("vencimento") ?? "" };
  const setFiltro = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  const resumo = trpc.contratos.resumo.useQuery();
  const q = trpc.contratos.listar.useQuery({ busca: filtros.busca || undefined, situacao: filtros.situacao as "ativo", vencimento: (filtros.vencimento || undefined) as "30" | undefined });
  const [aberto, setAberto] = useState<string | null>(null);
  const [form, setForm] = useState<{ contrato?: Saidas["contratos"]["obter"]; preencher?: PreenchimentoContrato } | null>(null);
  const r = resumo.data;

  return (
    <Pagina titulo="Contratos" acoes={podeEscrever && <Botao onClick={() => setForm({})}>+ Contrato</Botao>}>
      <Erro erro={resumo.error} tentar={() => resumo.refetch()} />
      {r && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Indicador rotulo="Receita mensal ativa" valor={moeda(r.mrrAtivo)} detalhe={`${r.ativos} ativos${r.suspensos ? ` · ${r.suspensos} suspensos` : ""}`} />
          <button className="block h-full w-full text-left hover:opacity-90 [&>div]:h-full" title="Ver contratos vencendo em 30 dias" onClick={() => setSp(new URLSearchParams({ situacao: "ativo", vencimento: "30" }), { replace: true })}><Indicador rotulo="Vencendo em 30 dias" valor={r.vencendo30} detalhe={r.vencidos ? <span className="text-red-600">{r.vencidos} já vencidos</span> : "Renove antes de vencer"} /></button>
          <Indicador rotulo="Inadimplência" valor={<span className={Number(r.inadimplencia) > 0 ? "text-red-600" : ""}>{moeda(r.inadimplencia)}</span>} detalhe="Cobranças de contratos vencidas e não pagas" />
          <Indicador rotulo="Cancelados no mês" valor={r.canceladosMes} detalhe={`${moeda(r.mrrCanceladoMes)}/mês perdidos`} />
          <Indicador rotulo="Vendas sem contrato" valor={<span className={r.ganhasSemContrato.length ? "text-amber-600" : ""}>{r.ganhasSemContrato.length}</span>} detalhe="Oportunidades ganhas sem contrato" />
        </div>
      )}
      {r && r.ganhasSemContrato.length > 0 && (
        <Cartao titulo={`Vendas ganhas sem contrato (${r.ganhasSemContrato.length})`}>
          <p className="mb-2 text-xs text-slate-500">Sem contrato, a venda não gera cobrança nem entra na receita mensal ativa.</p>
          <ul className="divide-y text-sm">{r.ganhasSemContrato.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><Link to={`/oportunidades/${o.id}`} className="font-medium text-indigo-700 hover:underline">{o.titulo}</Link> · {o.empresa ?? <span className="text-red-600">sem empresa</span>} · {moeda(o.valor)}/mês · ganha em {data(o.fechadaEm)}</span>
              {podeEscrever && (o.empresaId
                ? <Botao variante="secundario" onClick={() => setForm({ preencher: { empresaId: o.empresaId, oportunidadeId: o.id, valorMensal: o.valor } })}>Criar contrato</Botao>
                : <Link to={`/oportunidades/${o.id}`} className="text-xs underline">vincular empresa primeiro</Link>)}
            </li>
          ))}</ul>
        </Cartao>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-64"><Campo rotulo="Buscar empresa" value={filtros.busca} onChange={(e) => setFiltro("busca", e.target.value)} /></div>
        <div className="w-40"><Selecao rotulo="Situação" value={filtros.situacao} onChange={(e) => setFiltro("situacao", e.target.value)}><option value="ativo">Ativos</option><option value="suspenso">Suspensos</option><option value="cancelado">Cancelados</option><option value="todos">Todos</option></Selecao></div>
        <div className="w-48"><Selecao rotulo="Vencimento" value={filtros.vencimento} onChange={(e) => setFiltro("vencimento", e.target.value)}><option value="">Qualquer</option><option value="30">Vence em até 30 dias</option><option value="60">Vence em até 60 dias</option><option value="90">Vence em até 90 dias</option><option value="vencidos">Já vencidos</option><option value="sem_fim">Sem data de fim</option></Selecao></div>
        {sp.toString() && <Botao variante="fantasma" onClick={() => setSp(new URLSearchParams(), { replace: true })}>Limpar filtros</Botao>}
      </div>
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !q.data?.length ? (
        <Vazio texto={sp.toString() ? "Nenhum contrato com estes filtros." : "Nenhum contrato ativo ainda."} acao={podeEscrever && !sp.toString() && <Botao onClick={() => setForm({})}>Registrar o primeiro</Botao>} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b px-3 py-2 text-xs text-slate-500">{q.data.length} contrato(s) · mensalidades somadas {moeda((q.data.reduce((a, c) => a + Math.round(Number(c.valorMensal) * 100), 0) / 100).toFixed(2))}</div>
          <Tabela colunas={["Empresa", "Plano", "Mensalidade", "Vigência", "Financeiro", "Situação", ""]}>
            {q.data.map((c: Linha) => (
              <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setAberto(c.id)}>
                <td className="px-3 py-2 font-medium">{c.empresa}</td>
                <td className="px-3 py-2">{c.plano}</td>
                <td className="whitespace-nowrap px-3 py-2">{moeda(c.valorMensal)} <span className="text-xs text-slate-400">dia {c.diaVencimento}</span></td>
                <td className="px-3 py-2 text-sm"><Vigencia c={c} /></td>
                <td className="px-3 py-2"><Financeiro c={c} /></td>
                <td className="px-3 py-2"><Etiqueta valor={c.situacao} /></td>
                <td className="px-3 py-2"><button className="text-xs text-indigo-700 underline" onClick={(e) => { e.stopPropagation(); setAberto(c.id); }}>Abrir</button></td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}
      {aberto && <Detalhe id={aberto} aoFechar={() => setAberto(null)} aoEditar={(c) => { setAberto(null); setForm({ contrato: c }); }} />}
      {form && <FormContrato aoFechar={() => setForm(null)} contrato={form.contrato} preencher={form.preencher} />}
    </Pagina>
  );
}
