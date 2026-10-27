import { useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { trpc, type Saidas } from "../lib/trpc";
import { data, fimDoMesISO, hojeISO, inicioDoMesISO, moeda } from "../lib/formato";
import { usePode } from "../lib/sessao";
import { useAvisar } from "../lib/aviso";
import { AreaTexto, Botao, Campo, Carregando, Cartao, Erro, Etiqueta, Indicador, Modal, Pagina, Selecao, Tabela, Vazio } from "../components/ui";

type Filtros = Record<string, string>;
const linkLista = (f: Filtros) => `/financeiro/lancamentos?${new URLSearchParams(f).toString()}`;
const mesAno = (m: string) => `${m.slice(5)}/${m.slice(0, 4)}`;

// Número clicável que leva à lista de lançamentos que o compõe (rastreabilidade)
function Rastreavel({ filtros, children }: { filtros: Filtros; children: React.ReactNode }) {
  return <Link to={linkLista(filtros)} className="hover:underline" title="Ver lançamentos que compõem este valor">{children}</Link>;
}

function Painel() {
  const [de, setDe] = useState(inicioDoMesISO());
  const [ate, setAte] = useState(fimDoMesISO(hojeISO().slice(0, 7)));
  const q = trpc.financeiro.painel.useQuery({ de, ate }, { enabled: de <= ate });
  const d = q.data;
  const per = { de, ate };
  const max = Math.max(1, ...(d?.porMes.flatMap((m) => [m.previstoReceitas, m.realizadoReceitas, m.previstoDespesas, m.realizadoDespesas].map(Number)) ?? [1]));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Campo rotulo="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        {de > ate && <p className="pb-2 text-sm text-red-600">A data inicial precisa ser anterior à final.</p>}
      </div>
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : d && (
        <>
          <p className="text-xs text-slate-500">Clique em qualquer valor para ver os lançamentos que o compõem. Fórmulas em docs/INDICADORES.md.</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador rotulo="Vendido (MRR ativo)" valor={<Link to="/contratos" className="hover:underline">{moeda(d.vendido)}</Link>} detalhe="Contratos ativos hoje. Não é dinheiro." />
            <Indicador rotulo="Faturado" valor={<Rastreavel filtros={{ tipo: "receita", situacao: "ativos", campoData: "competencia", ...per }}>{moeda(d.faturado)}</Rastreavel>} detalhe="Receitas por competência no período" />
            <Indicador rotulo="Recebido" valor={<Rastreavel filtros={{ tipo: "receita", situacao: "pago", campoData: "pagamento", ...per }}>{moeda(d.recebido)}</Rastreavel>} detalhe="Entradas efetivas no período" />
            <Indicador rotulo="Em atraso a receber" valor={<Rastreavel filtros={{ tipo: "receita", situacao: "atrasado" }}>{moeda(d.atrasoReceber.total)}</Rastreavel>} detalhe={`${d.atrasoReceber.n} lançamentos vencidos (até hoje)`} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador rotulo="Saldo realizado" valor={<span className={Number(d.saldoRealizado) < 0 ? "text-red-600" : ""}>{moeda(d.saldoRealizado)}</span>}
              detalhe={<>Recebido − <Rastreavel filtros={{ tipo: "despesa", situacao: "pago", campoData: "pagamento", ...per }}>despesas pagas {moeda(d.despesasPagas)}</Rastreavel></>} />
            <Indicador rotulo="Saldo previsto" valor={<span className={Number(d.saldoPrevisto) < 0 ? "text-red-600" : ""}>{moeda(d.saldoPrevisto)}</span>}
              detalhe={<><Rastreavel filtros={{ tipo: "receita", situacao: "ativos", campoData: "vencimento", ...per }}>{moeda(d.previstoReceitas)}</Rastreavel> − <Rastreavel filtros={{ tipo: "despesa", situacao: "ativos", campoData: "vencimento", ...per }}>{moeda(d.previstoDespesas)}</Rastreavel> (por vencimento)</>} />
            <Indicador rotulo="Em atraso a pagar" valor={<Rastreavel filtros={{ tipo: "despesa", situacao: "atrasado" }}>{moeda(d.atrasoPagar.total)}</Rastreavel>} detalhe={`${d.atrasoPagar.n} contas vencidas`} />
            <Indicador rotulo="Previsto − realizado (receitas)" valor={moeda((Number(d.previstoReceitas) - Number(d.recebido)).toFixed(2))} detalhe="Quanto do previsto ainda não entrou" />
          </div>
          <Cartao titulo="Fluxo de caixa mês a mês: previsto × realizado">
            {d.porMes.length === 0 ? <Vazio texto="Sem meses no período." /> : (
              <div className="space-y-4">
                {d.porMes.map((m) => {
                  const mesFiltro = { de: `${m.mes}-01`, ate: fimDoMesISO(m.mes) };
                  const barra = (v: string, cor: string, f: Filtros, rot: string) => (
                    <Link to={linkLista(f)} className="flex items-center gap-2 text-xs hover:opacity-80" title={`${rot}: ${moeda(v)}`}>
                      <span className="w-32 shrink-0 text-slate-500">{rot}</span>
                      <span className={`h-3 rounded ${cor}`} style={{ width: `${(Number(v) / max) * 60}%`, minWidth: Number(v) > 0 ? 2 : 0 }} />
                      <span className="text-slate-700">{moeda(v)}</span>
                    </Link>
                  );
                  return (
                    <div key={m.mes}>
                      <div className="mb-1 flex justify-between text-sm font-medium text-slate-700"><span>{mesAno(m.mes)}</span><span className="text-xs font-normal text-slate-500">saldo realizado {moeda(m.saldoRealizado)} · previsto {moeda(m.saldoPrevisto)}</span></div>
                      {barra(m.previstoReceitas, "bg-emerald-200", { tipo: "receita", situacao: "ativos", campoData: "vencimento", ...mesFiltro }, "Receitas previstas")}
                      {barra(m.realizadoReceitas, "bg-emerald-600", { tipo: "receita", situacao: "pago", campoData: "pagamento", ...mesFiltro }, "Receitas recebidas")}
                      {barra(m.previstoDespesas, "bg-rose-200", { tipo: "despesa", situacao: "ativos", campoData: "vencimento", ...mesFiltro }, "Despesas previstas")}
                      {barra(m.realizadoDespesas, "bg-rose-600", { tipo: "despesa", situacao: "pago", campoData: "pagamento", ...mesFiltro }, "Despesas pagas")}
                    </div>
                  );
                })}
              </div>
            )}
          </Cartao>
          <Cartao titulo="Por categoria (período)">
            {d.porCategoria.length === 0 ? <Vazio texto="Nenhum lançamento no período." /> : (
              <Tabela colunas={["Categoria", "Tipo", "Previsto", "Realizado"]}>
                {d.porCategoria.map((c) => (
                  <tr key={c.categoriaId}>
                    <td className="px-3 py-2">{c.categoria}</td><td className="px-3 py-2"><Etiqueta valor={c.tipo === "receita" ? "ganha" : "perdida"} texto={c.tipo} /></td>
                    <td className="px-3 py-2"><Rastreavel filtros={{ categoriaId: c.categoriaId, situacao: "ativos", campoData: "vencimento", ...per }}>{moeda(c.previsto)}</Rastreavel></td>
                    <td className="px-3 py-2"><Rastreavel filtros={{ categoriaId: c.categoriaId, situacao: "pago", campoData: "pagamento", ...per }}>{moeda(c.realizado)}</Rastreavel></td>
                  </tr>
                ))}
              </Tabela>
            )}
          </Cartao>
        </>
      )}
    </div>
  );
}

type Lanc = Saidas["financeiro"]["lancamentos"]["linhas"][number];

function FormLancamento({ aberto, aoFechar, editar }: { aberto: boolean; aoFechar: () => void; editar?: Lanc | null }) {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const cats = trpc.financeiro.categorias.useQuery(undefined, { enabled: aberto });
  const [f, setF] = useState(() => ({
    tipo: editar?.tipo ?? "despesa", descricao: editar?.descricao ?? "", categoriaId: editar?.categoriaId ?? "",
    valor: editar?.valor.replace(".", ",") ?? "", vencimento: editar?.vencimento ?? hojeISO(), competencia: editar?.competencia.slice(0, 7) ?? "",
    jaPago: false, pagoEm: hojeISO(), observacao: editar?.observacao ?? "",
  }));
  const ok = (msg: string) => () => { utils.financeiro.invalidate(); avisar(msg); aoFechar(); };
  const criar = trpc.financeiro.criarLancamento.useMutation({ onSuccess: ok("Lançamento criado.") });
  const atualizar = trpc.financeiro.atualizarLancamento.useMutation({ onSuccess: ok("Lançamento atualizado.") });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const erro = criar.error ?? atualizar.error;
  return (
    <Modal titulo={editar ? "Editar lançamento" : "Novo lançamento"} aberto={aberto} aoFechar={aoFechar}>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        if (editar) atualizar.mutate({ id: editar.id, versao: editar.versao, descricao: f.descricao, categoriaId: f.categoriaId, valor: f.valor, vencimento: f.vencimento, competencia: f.competencia || undefined, observacao: f.observacao || null });
        else criar.mutate({ tipo: f.tipo as "receita", descricao: f.descricao, categoriaId: f.categoriaId, valor: f.valor, vencimento: f.vencimento, competencia: f.competencia || undefined, observacao: f.observacao || null, pagoEm: f.jaPago ? f.pagoEm : null });
      }}>
        {!editar && (
          <Selecao rotulo="Tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as "receita", categoriaId: "" })}>
            <option value="despesa">Despesa (conta a pagar)</option><option value="receita">Receita (conta a receber)</option>
          </Selecao>
        )}
        <Campo rotulo="Descrição *" required value={f.descricao} onChange={set("descricao")} placeholder="Ex.: VPS Hostinger — outubro" />
        <div className="grid grid-cols-2 gap-3">
          <Selecao rotulo="Categoria *" required value={f.categoriaId} onChange={set("categoriaId")}>
            <option value="">Escolha…</option>
            {cats.data?.filter((c) => c.tipo === f.tipo && (c.ativa || c.id === f.categoriaId)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
          <Campo rotulo="Valor (R$) *" required inputMode="decimal" placeholder="1.234,56" value={f.valor} onChange={set("valor")} />
          <Campo rotulo="Vencimento *" type="date" required value={f.vencimento} onChange={set("vencimento")} />
          <Campo rotulo="Competência (mês)" type="month" value={f.competencia} onChange={set("competencia")} placeholder="padrão: mês do vencimento" />
        </div>
        {!editar && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={f.jaPago} onChange={(e) => setF({ ...f, jaPago: e.target.checked })} /> Já foi pago/recebido</label>
            {f.jaPago && <Campo rotulo="Pago em" type="date" max={hojeISO()} value={f.pagoEm} onChange={set("pagoEm")} />}
          </div>
        )}
        <AreaTexto rotulo="Observação" value={f.observacao} onChange={set("observacao")} rows={2} />
        <Erro erro={erro} />
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={criar.isPending || atualizar.isPending}>Salvar</Botao></div>
      </form>
    </Modal>
  );
}

function Lancamentos() {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const podeEscrever = usePode("financeiro:escrever");
  const [sp, setSp] = useSearchParams();
  const filtros = Object.fromEntries(sp.entries());
  const pagina = Number(filtros.pagina ?? 1);
  const entrada = {
    tipo: (filtros.tipo || undefined) as "receita" | undefined,
    categoriaId: filtros.categoriaId || undefined,
    situacao: (filtros.situacao || undefined) as "pendente" | undefined,
    campoData: (filtros.campoData || "vencimento") as "vencimento",
    de: filtros.de || undefined, ate: filtros.ate || undefined, busca: filtros.busca || undefined, pagina,
  };
  const q = trpc.financeiro.lancamentos.useQuery(entrada);
  const cats = trpc.financeiro.categorias.useQuery();
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState<Lanc | null>(null);
  const [baixa, setBaixa] = useState<Lanc | null>(null);
  const [cancelar, setCancelar] = useState<Lanc | null>(null);
  const [gerar, setGerar] = useState(false);
  const [pagoEm, setPagoEm] = useState(hojeISO());
  const [valorPago, setValorPago] = useState("");
  const [motivo, setMotivo] = useState("");
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const ok = (msg: string, fechar: () => void) => ({ onSuccess: () => { utils.financeiro.invalidate(); avisar(msg); fechar(); }, onError: (e: { message: string }) => avisar(e.message, "erro") });
  const baixar = trpc.financeiro.baixar.useMutation(ok("Baixa registrada.", () => setBaixa(null)));
  const estornar = trpc.financeiro.estornarBaixa.useMutation(ok("Baixa estornada.", () => {}));
  const cancelarM = trpc.financeiro.cancelar.useMutation(ok("Lançamento cancelado.", () => { setCancelar(null); setMotivo(""); }));
  const gerarM = trpc.financeiro.gerarCobrancas.useMutation({ onSuccess: (r) => { utils.financeiro.invalidate(); avisar(`${r.criados} cobranças criadas, ${r.jaExistentes} já existiam (${r.contratos} contratos).`); setGerar(false); } });
  const setFiltro = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); n.delete("pagina"); setSp(n); };
  const totalPaginas = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.porPagina)) : 1;
  const hoje = hojeISO();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-36"><Selecao rotulo="Tipo" value={filtros.tipo ?? ""} onChange={(e) => setFiltro("tipo", e.target.value)}><option value="">Todos</option><option value="receita">A receber</option><option value="despesa">A pagar</option></Selecao></div>
        <div className="w-36"><Selecao rotulo="Situação" value={filtros.situacao ?? ""} onChange={(e) => setFiltro("situacao", e.target.value)}><option value="">Todas</option><option value="pendente">Pendentes</option><option value="atrasado">Em atraso</option><option value="pago">Pagas</option><option value="ativos">Não canceladas</option><option value="cancelado">Canceladas</option></Selecao></div>
        <div className="w-44"><Selecao rotulo="Categoria" value={filtros.categoriaId ?? ""} onChange={(e) => setFiltro("categoriaId", e.target.value)}><option value="">Todas</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.tipo})</option>)}</Selecao></div>
        <div className="w-36"><Selecao rotulo="Data por" value={filtros.campoData ?? "vencimento"} onChange={(e) => setFiltro("campoData", e.target.value)}><option value="vencimento">Vencimento</option><option value="pagamento">Pagamento</option><option value="competencia">Competência</option></Selecao></div>
        <Campo rotulo="De" type="date" value={filtros.de ?? ""} onChange={(e) => setFiltro("de", e.target.value)} />
        <Campo rotulo="Até" type="date" value={filtros.ate ?? ""} onChange={(e) => setFiltro("ate", e.target.value)} />
        <div className="w-48"><Campo rotulo="Buscar" value={filtros.busca ?? ""} onChange={(e) => setFiltro("busca", e.target.value)} /></div>
        {sp.toString() && <Botao variante="fantasma" onClick={() => setSp(new URLSearchParams())}>Limpar filtros</Botao>}
        {podeEscrever && <div className="ml-auto flex gap-2"><Botao variante="secundario" onClick={() => setGerar(true)}>Gerar cobranças do mês</Botao><Botao onClick={() => setNovo(true)}>+ Lançamento</Botao></div>}
      </div>
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !q.data?.linhas.length ? <Vazio texto="Nenhum lançamento com estes filtros." /> : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap gap-4 border-b px-3 py-2 text-sm text-slate-600">
            <span>{q.data.total} lançamentos</span><span>Previsto: <b>{moeda(q.data.somaPrevista)}</b></span><span>Pago/recebido: <b>{moeda(q.data.somaPaga)}</b></span>
          </div>
          <Tabela colunas={["Vencimento", "Descrição", "Categoria", "Valor", "Situação", "Pago em", "Valor pago", ""]}>
            {q.data.linhas.map((l) => {
              const atrasado = l.situacao === "pendente" && l.vencimento < hoje;
              const diferenca = l.valorPago !== null && l.valorPago !== l.valor;
              return (
                <tr key={l.id} className={l.situacao === "cancelado" ? "text-slate-400" : ""}>
                  <td className={`whitespace-nowrap px-3 py-2 ${atrasado ? "font-medium text-red-600" : ""}`}>{data(l.vencimento)}</td>
                  <td className="px-3 py-2">
                    <span className={l.tipo === "receita" ? "text-emerald-700" : "text-rose-700"}>{l.tipo === "receita" ? "↑" : "↓"}</span> {l.descricao}
                    {l.empresaId && <Link to={`/empresas/${l.empresaId}`} className="ml-1 text-xs text-indigo-700 hover:underline">{l.empresa}</Link>}
                    {l.origem !== "manual" && <span className="ml-1 rounded bg-slate-100 px-1 text-xs">{l.origem}</span>}
                    {l.motivoCancelamento && <div className="text-xs">cancelado: {l.motivoCancelamento}</div>}
                  </td>
                  <td className="px-3 py-2">{l.categoria}</td>
                  <td className="whitespace-nowrap px-3 py-2">{moeda(l.valor)}</td>
                  <td className="px-3 py-2">{atrasado ? <Etiqueta valor="perdida" texto="em atraso" /> : <Etiqueta valor={l.situacao === "pago" ? "ativo" : l.situacao === "cancelado" ? "cancelado" : "suspenso"} texto={l.situacao} />}</td>
                  <td className="whitespace-nowrap px-3 py-2">{data(l.pagoEm)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{l.valorPago ? moeda(l.valorPago) : "—"}{diferenca && <span className="ml-1 text-xs text-amber-700" title="Diferente do previsto">({Number(l.valorPago) > Number(l.valor) ? "+" : ""}{moeda((Number(l.valorPago) - Number(l.valor)).toFixed(2))})</span>}</td>
                  <td className="space-x-2 whitespace-nowrap px-3 py-2 text-xs">
                    {podeEscrever && l.situacao === "pendente" && <>
                      <button className="font-medium text-emerald-700 underline" onClick={() => { setBaixa(l); setValorPago(l.valor.replace(".", ",")); setPagoEm(hoje); }}>Baixar</button>
                      <button className="underline" onClick={() => setEditar(l)}>Editar</button>
                      <button className="text-red-600 underline" onClick={() => setCancelar(l)}>Cancelar</button>
                    </>}
                    {podeEscrever && l.situacao === "pago" && <button className="underline" disabled={estornar.isPending} onClick={() => confirm("Estornar a baixa? O lançamento volta a ficar pendente.") && estornar.mutate({ id: l.id, versao: l.versao })}>Estornar</button>}
                  </td>
                </tr>
              );
            })}
          </Tabela>
          <div className="flex items-center justify-end gap-2 border-t px-3 py-2 text-xs text-slate-500">
            <Botao variante="fantasma" disabled={pagina <= 1} onClick={() => setFiltro("pagina", String(pagina - 1))}>Anterior</Botao><span>{pagina}/{totalPaginas}</span>
            <Botao variante="fantasma" disabled={pagina >= totalPaginas} onClick={() => { const n = new URLSearchParams(sp); n.set("pagina", String(pagina + 1)); setSp(n); }}>Próxima</Botao>
          </div>
        </div>
      )}
      {novo && <FormLancamento aberto aoFechar={() => setNovo(false)} />}
      {editar && <FormLancamento aberto editar={editar} aoFechar={() => setEditar(null)} />}
      <Modal titulo={`Baixar: ${baixa?.descricao ?? ""}`} aberto={!!baixa} aoFechar={() => setBaixa(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (baixa) baixar.mutate({ id: baixa.id, versao: baixa.versao, pagoEm, valorPago }); }}>
          <p className="text-sm text-slate-600">Valor previsto: {moeda(baixa?.valor)}. Informe o valor efetivo (com juros ou desconto, se houver).</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Data do pagamento" type="date" max={hoje} required value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} />
            <Campo rotulo="Valor pago (R$)" inputMode="decimal" required value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
          </div>
          <Erro erro={baixar.error} />
          <div className="flex justify-end"><Botao carregando={baixar.isPending}>Confirmar baixa</Botao></div>
        </form>
      </Modal>
      <Modal titulo={`Cancelar: ${cancelar?.descricao ?? ""}`} aberto={!!cancelar} aoFechar={() => setCancelar(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (cancelar) cancelarM.mutate({ id: cancelar.id, versao: cancelar.versao, motivo }); }}>
          <p className="text-sm text-slate-600">O lançamento sai de todos os totais, mas continua registrado com o motivo.</p>
          <Campo rotulo="Motivo *" required value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: lançado em duplicidade" />
          <Erro erro={cancelarM.error} />
          <div className="flex justify-end"><Botao variante="perigo" carregando={cancelarM.isPending}>Cancelar lançamento</Botao></div>
        </form>
      </Modal>
      <Modal titulo="Gerar cobranças dos contratos" aberto={gerar} aoFechar={() => setGerar(false)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); gerarM.mutate({ mes }); }}>
          <p className="text-sm text-slate-600">Cria a mensalidade de cada contrato ativo no mês (vencimento no dia de cobrança) e o setup no mês de início. Pode rodar mais de uma vez: o que já existe não é duplicado.</p>
          <Campo rotulo="Mês" type="month" required value={mes} onChange={(e) => setMes(e.target.value)} />
          <Erro erro={gerarM.error} />
          <div className="flex justify-end"><Botao carregando={gerarM.isPending}>Gerar</Botao></div>
        </form>
      </Modal>
    </div>
  );
}

function Categorias() {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const podeEscrever = usePode("financeiro:escrever");
  const q = trpc.financeiro.categorias.useQuery();
  const [nova, setNova] = useState({ nome: "", tipo: "despesa" as "despesa" | "receita" });
  const salvar = trpc.financeiro.salvarCategoria.useMutation({ onSuccess: () => { utils.financeiro.categorias.invalidate(); avisar("Categoria salva."); setNova({ ...nova, nome: "" }); }, onError: (e) => avisar(e.message, "erro") });
  return (
    <Cartao titulo="Categorias">
      {q.isLoading ? <Carregando /> : (
        <Tabela colunas={["Nome", "Tipo", "Situação", ""]}>
          {q.data?.map((c) => (
            <tr key={c.id} className={c.ativa ? "" : "text-slate-400"}>
              <td className="px-3 py-2">{c.nome}</td><td className="px-3 py-2">{c.tipo}</td><td className="px-3 py-2">{c.ativa ? "ativa" : "desativada"}</td>
              <td className="px-3 py-2 text-xs">{podeEscrever && <button className="underline" onClick={() => salvar.mutate({ id: c.id, nome: c.nome, tipo: c.tipo as "receita", ativa: !c.ativa })}>{c.ativa ? "Desativar" : "Reativar"}</button>}</td>
            </tr>
          ))}
        </Tabela>
      )}
      {podeEscrever && (
        <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); salvar.mutate({ nome: nova.nome, tipo: nova.tipo }); }}>
          <Campo rotulo="Nova categoria" required value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
          <Selecao rotulo="Tipo" value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as "despesa" })}><option value="despesa">despesa</option><option value="receita">receita</option></Selecao>
          <Botao carregando={salvar.isPending}>Adicionar</Botao>
        </form>
      )}
      <p className="mt-3 text-xs text-slate-500">Categorias não são excluídas, só desativadas, para preservar o histórico. "Mensalidades" e "Setup" são usadas na geração de cobranças.</p>
    </Cartao>
  );
}

export default function Financeiro() {
  // Caminhos absolutos: links relativos dentro de rota com * resolvem a partir da URL atual e geram laço
  const abas = [{ para: "/financeiro/painel", rotulo: "Painel" }, { para: "/financeiro/lancamentos", rotulo: "Lançamentos" }, { para: "/financeiro/lancamentos?tipo=receita&situacao=pendente", rotulo: "A receber" }, { para: "/financeiro/lancamentos?tipo=despesa&situacao=pendente", rotulo: "A pagar" }, { para: "/financeiro/categorias", rotulo: "Categorias" }];
  return (
    <Pagina titulo="Financeiro">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {abas.map((a) => <NavLink key={a.para} to={a.para} end className={({ isActive }) => `px-3 py-2 text-sm ${isActive ? "border-b-2 border-indigo-600 font-medium text-indigo-700" : "text-slate-600"}`}>{a.rotulo}</NavLink>)}
      </nav>
      <Routes>
        <Route path="painel" element={<Painel />} />
        <Route path="lancamentos" element={<Lancamentos />} />
        <Route path="categorias" element={<Categorias />} />
        <Route path="*" element={<Navigate to="/financeiro/painel" replace />} />
      </Routes>
    </Pagina>
  );
}
