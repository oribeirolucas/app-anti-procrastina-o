import { useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { trpc, type Saidas } from "../lib/trpc";
import { dataHora } from "../lib/formato";
import { usePode } from "../lib/sessao";
import { useAvisar } from "../lib/aviso";
import { Botao, Campo, Carregando, Cartao, Erro, Etiqueta, Modal, Pagina, Selecao, Tabela, Vazio } from "../components/ui";

type Automacao = Saidas["automacoes"]["listar"][number];
type AcaoForm =
  | { tipo: "criar_tarefa"; titulo: string; prazoDias: number; responsavel: "responsavel_registro" | "usuario"; usuarioId?: string }
  | { tipo: "notificar"; titulo: string; destino: "responsavel_registro" | "gestores" | "usuario"; usuarioId?: string }
  | { tipo: "iniciar_followup"; sequenciaId: string };

const ROTULO_ACAO = { criar_tarefa: "Criar tarefa", notificar: "Notificar (sininho)", iniciar_followup: "Iniciar follow-up" } as const;
const COM_OPORTUNIDADE = ["oportunidade.criada", "oportunidade.etapa_alterada", "oportunidade.encerrada", "lead.captado"];

function FormAutomacao({ editar, aoFechar }: { editar: Automacao | null; aoFechar: () => void }) {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const cat = trpc.automacoes.catalogo.useQuery();
  const etapas = trpc.pipeline.etapas.useQuery();
  const usuarios = trpc.admin.responsaveis.useQuery();
  const seqs = trpc.automacoes.sequencias.useQuery();
  const origens = trpc.automacoes.origens.useQuery();
  const ini = (editar?.condicoes ?? {}) as Record<string, string | number | undefined>;
  const [nome, setNome] = useState(editar?.nome ?? "");
  const [gatilho, setGatilho] = useState(editar?.gatilho ?? "oportunidade.etapa_alterada");
  const [cond, setCond] = useState({
    etapaId: String(ini.etapaId ?? ""), situacao: String(ini.situacao ?? ""), origem: String(ini.origem ?? ""),
    valorMinimo: ini.valorMinimo !== undefined ? String(ini.valorMinimo) : "", origemCaptacaoId: String(ini.origemCaptacaoId ?? ""), diasAntes: ini.diasAntes !== undefined ? String(ini.diasAntes) : "",
  });
  const [acoes, setAcoes] = useState<AcaoForm[]>((editar?.acoes as AcaoForm[]) ?? [{ tipo: "criar_tarefa", titulo: "", prazoDias: 1, responsavel: "responsavel_registro" }]);
  const salvar = trpc.automacoes.salvar.useMutation({ onSuccess: () => { utils.automacoes.invalidate(); avisar("Automação salva."); aoFechar(); } });
  const setAcao = (i: number, a: AcaoForm) => setAcoes(acoes.map((x, k) => (k === i ? a : x)));
  const temOport = COM_OPORTUNIDADE.includes(gatilho);

  const enviar = () => {
    const c: Record<string, unknown> = {};
    if (temOport && cond.etapaId) c.etapaId = cond.etapaId;
    if (gatilho === "oportunidade.encerrada" && cond.situacao) c.situacao = cond.situacao;
    if (temOport && cond.origem) c.origem = cond.origem;
    if (temOport && cond.valorMinimo) c.valorMinimo = Number(cond.valorMinimo.replace(",", "."));
    if (gatilho === "lead.captado" && cond.origemCaptacaoId) c.origemCaptacaoId = cond.origemCaptacaoId;
    if (gatilho === "contrato.vencendo" && cond.diasAntes !== "") c.diasAntes = Number(cond.diasAntes);
    salvar.mutate({ id: editar?.id, versao: editar?.versao, dados: { nome, gatilho: gatilho as "empresa.criada", condicoes: c, acoes } });
  };
  const campos = salvar.error?.data?.zod?.fieldErrors as Record<string, string[]> | undefined;

  return (
    <Modal titulo={editar ? "Editar automação" : "Nova automação"} aberto aoFechar={aoFechar} largura="max-w-2xl">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
        <Campo rotulo="Nome *" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Preparar demonstração" />
        <fieldset className="space-y-3 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-700">1. Quando (gatilho)</legend>
          <Selecao value={gatilho} onChange={(e) => setGatilho(e.target.value as typeof gatilho)} aria-label="Gatilho">
            {cat.data && Object.entries(cat.data.gatilhos).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Selecao>
        </fieldset>
        <fieldset className="space-y-3 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-700">2. Somente se (condições, opcionais)</legend>
          {temOport && (
            <div className="grid grid-cols-2 gap-3">
              <Selecao rotulo="Etapa da oportunidade" value={cond.etapaId} onChange={(e) => setCond({ ...cond, etapaId: e.target.value })}>
                <option value="">Qualquer</option>{etapas.data?.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </Selecao>
              <Campo rotulo="Origem igual a" placeholder="ligacao, site…" value={cond.origem} onChange={(e) => setCond({ ...cond, origem: e.target.value })} />
              <Campo rotulo="Valor mensal mínimo (R$)" inputMode="decimal" value={cond.valorMinimo} onChange={(e) => setCond({ ...cond, valorMinimo: e.target.value })} />
              {gatilho === "oportunidade.encerrada" && (
                <Selecao rotulo="Resultado" value={cond.situacao} onChange={(e) => setCond({ ...cond, situacao: e.target.value })}>
                  <option value="">Ganha ou perdida</option><option value="ganha">Ganha</option><option value="perdida">Perdida</option>
                </Selecao>
              )}
              {gatilho === "lead.captado" && (
                <Selecao rotulo="Origem de captação" value={cond.origemCaptacaoId} onChange={(e) => setCond({ ...cond, origemCaptacaoId: e.target.value })}>
                  <option value="">Qualquer</option>{origens.data?.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </Selecao>
              )}
            </div>
          )}
          {gatilho === "contrato.vencendo" && <Campo rotulo="Quantos dias antes do vencimento? *" type="number" min={0} max={365} required value={cond.diasAntes} onChange={(e) => setCond({ ...cond, diasAntes: e.target.value })} />}
          {!temOport && gatilho !== "contrato.vencendo" && <p className="text-xs text-slate-500">Este gatilho não tem condições: executa sempre.</p>}
        </fieldset>
        <fieldset className="space-y-3 rounded-md border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-700">3. Então (ações)</legend>
          <p className="text-xs text-slate-500">Nos títulos você pode usar {"{empresa}"}, {"{oportunidade}"} e {"{contato}"}. Nenhuma mensagem é enviada ao cliente: as ações são internas.</p>
          {acoes.map((a, i) => (
            <div key={i} className="space-y-2 rounded-md bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <Selecao value={a.tipo} aria-label="Tipo de ação" onChange={(e) => {
                  const t = e.target.value as AcaoForm["tipo"];
                  setAcao(i, t === "criar_tarefa" ? { tipo: t, titulo: "", prazoDias: 1, responsavel: "responsavel_registro" } : t === "notificar" ? { tipo: t, titulo: "", destino: "responsavel_registro" } : { tipo: t, sequenciaId: "" });
                }}>
                  {Object.entries(ROTULO_ACAO).map(([k, v]) => <option key={k} value={k} disabled={k === "iniciar_followup" && !temOport}>{v}</option>)}
                </Selecao>
                {acoes.length > 1 && <button type="button" className="text-xs text-red-600 underline" onClick={() => setAcoes(acoes.filter((_, k) => k !== i))}>remover</button>}
              </div>
              {a.tipo === "criar_tarefa" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2"><Campo rotulo="Título da tarefa" required value={a.titulo} onChange={(e) => setAcao(i, { ...a, titulo: e.target.value })} /></div>
                  <Campo rotulo="Prazo (dias)" type="number" min={0} max={365} value={a.prazoDias} onChange={(e) => setAcao(i, { ...a, prazoDias: Number(e.target.value) })} />
                  <Selecao rotulo="Para" value={a.usuarioId ?? a.responsavel} onChange={(e) => setAcao(i, e.target.value === "responsavel_registro" ? { ...a, responsavel: "responsavel_registro", usuarioId: undefined } : { ...a, responsavel: "usuario", usuarioId: e.target.value })}>
                    <option value="responsavel_registro">Responsável do registro</option>{usuarios.data?.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </Selecao>
                </div>
              )}
              {a.tipo === "notificar" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2"><Campo rotulo="Título do aviso" required value={a.titulo} onChange={(e) => setAcao(i, { ...a, titulo: e.target.value })} /></div>
                  <Selecao rotulo="Para" value={a.usuarioId ?? a.destino} onChange={(e) => setAcao(i, ["responsavel_registro", "gestores"].includes(e.target.value) ? { ...a, destino: e.target.value as "gestores", usuarioId: undefined } : { ...a, destino: "usuario", usuarioId: e.target.value })}>
                    <option value="responsavel_registro">Responsável do registro</option><option value="gestores">Gestores e admins</option>{usuarios.data?.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                  </Selecao>
                </div>
              )}
              {a.tipo === "iniciar_followup" && (
                <Selecao rotulo="Sequência" required value={a.sequenciaId} onChange={(e) => setAcao(i, { ...a, sequenciaId: e.target.value })}>
                  <option value="">Escolha…</option>{seqs.data?.filter((s) => s.ativa).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </Selecao>
              )}
            </div>
          ))}
          {acoes.length < 10 && <Botao type="button" variante="secundario" onClick={() => setAcoes([...acoes, { tipo: "notificar", titulo: "", destino: "responsavel_registro" }])}>+ Ação</Botao>}
        </fieldset>
        {campos && <ul className="text-xs text-red-600">{Object.entries(campos).map(([k, v]) => <li key={k}>{v.join("; ")}</li>)}</ul>}
        <Erro erro={salvar.error} />
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={salvar.isPending}>Salvar</Botao></div>
      </form>
    </Modal>
  );
}

function ListaAutomacoes() {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const gerir = usePode("automacoes:gerir");
  const q = trpc.automacoes.listar.useQuery();
  const cat = trpc.automacoes.catalogo.useQuery();
  const [editar, setEditar] = useState<Automacao | null | undefined>(undefined);
  const ativa = trpc.automacoes.definirAtiva.useMutation({ onSuccess: (a) => { utils.automacoes.listar.invalidate(); avisar(a.ativa ? "Automação retomada." : "Automação pausada."); } });
  const processar = trpc.automacoes.processarAgora.useMutation({ onSuccess: (r) => { utils.invalidate(); avisar("ignorado" in r ? "Já havia um processamento em andamento." : `Processados ${r.eventos.processados} eventos, ${r.followups.executados} passos de follow-up.`); } });
  return (
    <div className="space-y-3">
      {gerir && <div className="flex flex-wrap gap-2"><Botao onClick={() => setEditar(null)}>+ Automação</Botao><Botao variante="secundario" carregando={processar.isPending} onClick={() => processar.mutate()}>Processar agora</Botao></div>}
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio texto="Nenhuma automação. Crie a primeira: ex. criar uma tarefa quando a oportunidade entrar em Demonstração." /> : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Tabela colunas={["Nome", "Quando", "Ações", "Execuções", "Situação", ""]}>
            {q.data.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2 font-medium">{a.nome}</td>
                <td className="px-3 py-2 text-xs">{cat.data?.gatilhos[a.gatilho as keyof typeof cat.data.gatilhos] ?? a.gatilho}</td>
                <td className="px-3 py-2 text-xs">{(a.acoes as AcaoForm[]).map((x) => ROTULO_ACAO[x.tipo]).join(", ")}</td>
                <td className="px-3 py-2 text-xs">{a.execucoes} ok{a.erros > 0 && <span className="ml-1 text-red-600">· {a.erros} com erro</span>}</td>
                <td className="px-3 py-2"><Etiqueta valor={a.ativa ? "ativo" : "suspenso"} texto={a.ativa ? "ativa" : "pausada"} /></td>
                <td className="space-x-3 whitespace-nowrap px-3 py-2 text-xs">
                  {gerir && <><button className="underline" onClick={() => setEditar(a)}>Editar</button><button className="underline" disabled={ativa.isPending} onClick={() => ativa.mutate({ id: a.id, ativa: !a.ativa })}>{a.ativa ? "Pausar" : "Retomar"}</button></>}
                </td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}
      {editar !== undefined && <FormAutomacao editar={editar} aoFechar={() => setEditar(undefined)} />}
    </div>
  );
}

function Execucoes() {
  const [situacao, setSituacao] = useState("");
  const q = trpc.automacoes.execucoes.useQuery({ situacao: (situacao || undefined) as "erro" | undefined });
  const fila = trpc.automacoes.fila.useQuery();
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const gerir = usePode("automacoes:gerir");
  const reproc = trpc.automacoes.reprocessarEvento.useMutation({ onSuccess: () => { utils.automacoes.invalidate(); avisar("Evento reprocessado."); }, onError: (e) => avisar(e.message, "erro") });
  return (
    <div className="space-y-4">
      {fila.data && (
        <Cartao titulo="Saúde da fila de eventos">
          <div className="flex flex-wrap gap-4 text-sm">
            {fila.data.porSituacao.map((s) => <span key={s.situacao}><Etiqueta valor={s.situacao === "falhou" ? "perdida" : s.situacao === "pendente" ? "suspenso" : "ativo"} texto={s.situacao} /> {s.n}</span>)}
          </div>
          {fila.data.falhos.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium text-red-700">Eventos que esgotaram as 5 tentativas (exigem intervenção)</p>
              <ul className="mt-1 divide-y text-xs">{fila.data.falhos.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                  <span><b>{f.tipo}</b> · {dataHora(f.criadoEm)} · {f.ultimoErro}</span>
                  {gerir && <Botao variante="secundario" onClick={() => reproc.mutate({ id: f.id })}>Reprocessar</Botao>}
                </li>
              ))}</ul>
            </div>
          )}
          {fila.data.comErro.length > 0 && <p className="mt-2 text-xs text-amber-700">{fila.data.comErro.length} evento(s) com erro aguardando nova tentativa automática.</p>}
        </Cartao>
      )}
      <div className="w-48"><Selecao rotulo="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value)}><option value="">Todas</option><option value="sucesso">Sucesso</option><option value="ignorada">Ignorada (condição)</option><option value="erro">Erro</option></Selecao></div>
      <Erro erro={q.error} />
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio texto="Nenhuma execução ainda." /> : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Tabela colunas={["Quando", "Automação", "Evento", "Resultado", "Tentativas", "Detalhe"]}>
            {q.data.map((x) => (
              <tr key={x.id}>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{dataHora(x.atualizadoEm)}</td>
                <td className="px-3 py-2">{x.automacao}</td>
                <td className="px-3 py-2 font-mono text-xs">{x.evento}</td>
                <td className="px-3 py-2"><Etiqueta valor={x.situacao === "sucesso" ? "ativo" : x.situacao === "erro" ? "perdida" : "cancelado"} texto={x.situacao} /></td>
                <td className="px-3 py-2 text-xs">{x.tentativas}</td>
                <td className="max-w-xs truncate px-3 py-2 text-xs text-slate-500" title={x.erro ?? JSON.stringify(x.detalhes)}>{x.erro ?? JSON.stringify(x.detalhes)}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}
    </div>
  );
}

function Followups() {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const gerir = usePode("automacoes:gerir");
  const seqs = trpc.automacoes.sequencias.useQuery();
  const insc = trpc.automacoes.inscricoes.useQuery({});
  const [form, setForm] = useState<{ id?: string; nome: string; ativa: boolean; passos: { aposDias: number; titulo: string }[] } | null>(null);
  const salvar = trpc.automacoes.salvarSequencia.useMutation({ onSuccess: () => { utils.automacoes.invalidate(); avisar("Sequência salva."); setForm(null); } });
  return (
    <div className="space-y-4">
      <Cartao titulo="Sequências de follow-up" acoes={gerir && <Botao onClick={() => setForm({ nome: "", ativa: true, passos: [{ aposDias: 1, titulo: "Primeiro toque com {contato}" }, { aposDias: 3, titulo: "Segundo toque" }, { aposDias: 7, titulo: "Último toque" }] })}>+ Sequência</Botao>}>
        <p className="mb-3 text-xs text-slate-500">Cada passo cria uma tarefa para o responsável após o intervalo. A sequência para sozinha quando o contato responde (marque "O contato respondeu" ao registrar a interação), pede descadastro, ou a oportunidade é ganha/perdida/arquivada. Ela é iniciada por uma automação (ação "Iniciar follow-up").</p>
        {seqs.isLoading ? <Carregando /> : !seqs.data?.length ? <Vazio texto="Nenhuma sequência." /> : (
          <ul className="divide-y text-sm">{seqs.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><b>{s.nome}</b> · {(s.passos as unknown[]).length} passos · {s.inscricoesAtivas} em andamento {!s.ativa && <Etiqueta valor="suspenso" texto="pausada" />}</span>
              {gerir && <button className="text-xs underline" onClick={() => setForm({ id: s.id, nome: s.nome, ativa: s.ativa, passos: s.passos as { aposDias: number; titulo: string }[] })}>Editar</button>}
            </li>
          ))}</ul>
        )}
      </Cartao>
      <Cartao titulo="Follow-ups recentes">
        {insc.isLoading ? <Carregando /> : !insc.data?.length ? <Vazio texto="Nenhum follow-up iniciado." /> : (
          <Tabela colunas={["Oportunidade", "Sequência", "Passo", "Próximo", "Situação"]}>
            {insc.data.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2">{i.oportunidade}</td><td className="px-3 py-2">{i.sequencia}</td>
                <td className="px-3 py-2 text-xs">{Math.min(i.passoAtual, i.totalPassos)}/{i.totalPassos}</td>
                <td className="px-3 py-2 text-xs">{dataHora(i.proximoEm)}</td>
                <td className="px-3 py-2 text-xs"><Etiqueta valor={i.situacao === "ativa" ? "ativo" : i.situacao === "concluida" ? "ganha" : "cancelado"} texto={i.situacao} /> {i.motivoParada}</td>
              </tr>
            ))}
          </Tabela>
        )}
      </Cartao>
      {form && (
        <Modal titulo={form.id ? "Editar sequência" : "Nova sequência"} aberto aoFechar={() => setForm(null)} largura="max-w-xl">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); salvar.mutate(form); }}>
            <Campo rotulo="Nome *" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Retomada de avaliação" />
            {form.passos.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="w-28"><Campo rotulo={i === 0 ? "Dias após início" : "Dias após anterior"} type="number" min={0} max={365} value={p.aposDias} onChange={(e) => setForm({ ...form, passos: form.passos.map((x, k) => (k === i ? { ...x, aposDias: Number(e.target.value) } : x)) })} /></div>
                <div className="flex-1"><Campo rotulo={`Tarefa do passo ${i + 1}`} required value={p.titulo} onChange={(e) => setForm({ ...form, passos: form.passos.map((x, k) => (k === i ? { ...x, titulo: e.target.value } : x)) })} /></div>
                {form.passos.length > 1 && <button type="button" className="pb-2 text-xs text-red-600 underline" onClick={() => setForm({ ...form, passos: form.passos.filter((_, k) => k !== i) })}>remover</button>}
              </div>
            ))}
            <Botao type="button" variante="secundario" onClick={() => setForm({ ...form, passos: [...form.passos, { aposDias: 3, titulo: "" }] })}>+ Passo</Botao>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} /> Ativa (pausar interrompe os follow-ups em andamento no próximo passo)</label>
            <Erro erro={salvar.error} />
            <div className="flex justify-end"><Botao carregando={salvar.isPending}>Salvar</Botao></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Origens() {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const gerir = usePode("automacoes:gerir");
  const q = trpc.automacoes.origens.useQuery();
  const etapas = trpc.pipeline.etapas.useQuery();
  const [nova, setNova] = useState<{ nome: string; modo: "hmac" | "publico"; etapaId: string; origemRotulo: string; dominioPermitido: string } | null>(null);
  const [segredo, setSegredo] = useState<{ id: string; segredo: string } | null>(null);
  const [ver, setVer] = useState<string | null>(null);
  const criar = trpc.automacoes.criarOrigem.useMutation({ onSuccess: (r) => { utils.automacoes.origens.invalidate(); setNova(null); if (r.segredo) setSegredo({ id: r.id, segredo: r.segredo }); else setVer(r.id); avisar("Origem criada."); } });
  const rotacionar = trpc.automacoes.rotacionarSegredo.useMutation({ onSuccess: (r, v) => setSegredo({ id: v.id, segredo: r.segredo }) });
  const ativa = trpc.automacoes.definirOrigemAtiva.useMutation({ onSuccess: () => { utils.automacoes.origens.invalidate(); avisar("Origem atualizada."); } });
  const baseUrl = window.location.origin;
  const origemVer = q.data?.find((o) => o.id === ver);
  return (
    <div className="space-y-3">
      {gerir && <Botao onClick={() => setNova({ nome: "", modo: "publico", etapaId: "", origemRotulo: "site", dominioPermitido: "" })}>+ Origem de captação</Botao>}
      <Erro erro={q.error} />
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio texto="Nenhuma origem. Crie uma para receber leads de uma landing page ou do n8n direto no funil." /> : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Tabela colunas={["Nome", "Tipo", "Entra em", "Recebidos", "Último", "Situação", ""]}>
            {q.data.map((o) => (
              <tr key={o.id} className={o.ativa ? "" : "text-slate-400"}>
                <td className="px-3 py-2 font-medium">{o.nome}</td>
                <td className="px-3 py-2 text-xs">{o.modo === "hmac" ? "Webhook assinado" : "Formulário do site"}</td>
                <td className="px-3 py-2 text-xs">{o.etapa}</td><td className="px-3 py-2">{o.recebidos}</td>
                <td className="px-3 py-2 text-xs">{dataHora(o.ultimoRecebimentoEm)}</td>
                <td className="px-3 py-2"><Etiqueta valor={o.ativa ? "ativo" : "cancelado"} texto={o.ativa ? "ativa" : "revogada"} /></td>
                <td className="space-x-3 whitespace-nowrap px-3 py-2 text-xs">
                  <button className="underline" onClick={() => setVer(o.id)}>Como usar</button>
                  {gerir && o.modo === "hmac" && <button className="underline" onClick={() => confirm("Gerar novo segredo? O atual para de funcionar imediatamente.") && rotacionar.mutate({ id: o.id })}>Novo segredo</button>}
                  {gerir && <button className="underline" onClick={() => ativa.mutate({ id: o.id, ativa: !o.ativa })}>{o.ativa ? "Revogar" : "Reativar"}</button>}
                </td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}
      {nova && (
        <Modal titulo="Nova origem de captação" aberto aoFechar={() => setNova(null)}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); criar.mutate(nova); }}>
            <Campo rotulo="Nome *" required value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="Ex.: Landing page Odonto" />
            <Selecao rotulo="Tipo" value={nova.modo} onChange={(e) => setNova({ ...nova, modo: e.target.value as "hmac" })}>
              <option value="publico">Formulário do site (o navegador envia direto)</option>
              <option value="hmac">Webhook assinado (n8n, Zapier, outro sistema)</option>
            </Selecao>
            <div className="grid grid-cols-2 gap-3">
              <Selecao rotulo="Lead entra na etapa *" required value={nova.etapaId} onChange={(e) => setNova({ ...nova, etapaId: e.target.value })}>
                <option value="">Escolha…</option>{etapas.data?.filter((x) => x.tipo === "aberta").map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </Selecao>
              <Campo rotulo="Origem gravada na oportunidade" value={nova.origemRotulo} onChange={(e) => setNova({ ...nova, origemRotulo: e.target.value })} />
            </div>
            {nova.modo === "publico" && <Campo rotulo="Domínio do site (recomendado)" placeholder="https://minhaclinica.com.br" value={nova.dominioPermitido} onChange={(e) => setNova({ ...nova, dominioPermitido: e.target.value })} />}
            <Erro erro={criar.error} />
            <div className="flex justify-end"><Botao carregando={criar.isPending}>Criar</Botao></div>
          </form>
        </Modal>
      )}
      <Modal titulo="Guarde o segredo agora" aberto={!!segredo} aoFechar={() => { const id = segredo?.id; setSegredo(null); if (id) setVer(id); }}>
        <p className="text-sm text-slate-600">Ele <b>não será exibido de novo</b>. Configure no n8n/sistema que vai enviar os leads. Se perder, gere um novo.</p>
        <code className="mt-2 block break-all rounded bg-slate-100 p-2 text-sm">{segredo?.segredo}</code>
        <div className="mt-3 flex justify-end"><Botao onClick={() => navigator.clipboard?.writeText(segredo?.segredo ?? "").then(() => avisar("Copiado."))}>Copiar</Botao></div>
      </Modal>
      <Modal titulo={`Como usar: ${origemVer?.nome ?? ""}`} aberto={!!origemVer} aoFechar={() => setVer(null)} largura="max-w-2xl">
        {origemVer?.modo === "publico" ? (
          <div className="space-y-2 text-sm">
            <p>Cole este formulário no seu site. Campos aceitos: <code>nome</code>, <code>email</code>, <code>telefone</code>, <code>empresa</code>, <code>cidade</code>, <code>mensagem</code>. O campo oculto <code>website</code> é uma armadilha para robôs: deixe-o como está.</p>
            <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{`<form id="form-lead">
  <input name="nome" placeholder="Seu nome" required>
  <input name="email" type="email" placeholder="E-mail">
  <input name="telefone" placeholder="WhatsApp">
  <textarea name="mensagem" placeholder="Como podemos ajudar?"></textarea>
  <input name="website" style="display:none" tabindex="-1" autocomplete="off">
  <button>Enviar</button>
</form>
<script>
document.getElementById("form-lead").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch("${baseUrl}/webhooks/formulario/${origemVer.id}", {
    method: "POST", body: new URLSearchParams(new FormData(e.target)),
  });
  alert(r.ok ? "Recebemos seu contato!" : "Não foi possível enviar. Tente de novo.");
});
</script>`}</pre>
            <p className="text-xs text-slate-500">Limite: 5 envios por visitante a cada 10 minutos. O mesmo e-mail/telefone no mesmo dia não gera lead duplicado.{origemVer.dominioPermitido ? ` Só aceita envios de ${origemVer.dominioPermitido}.` : " Sem domínio definido: aceita de qualquer site (defina um domínio para restringir)."}</p>
          </div>
        ) : origemVer && (
          <div className="space-y-2 text-sm">
            <p>Envie um <b>POST</b> com JSON para:</p>
            <code className="block break-all rounded bg-slate-100 p-2 text-xs">{baseUrl}/webhooks/captacao/{origemVer.id}</code>
            <p>Cabeçalhos:</p>
            <ul className="list-disc pl-5 text-xs">
              <li><code>Content-Type: application/json</code></li>
              <li><code>X-Assinatura: sha256=&lt;HMAC-SHA256 do corpo, em hex, com o segredo&gt;</code></li>
              <li><code>X-Id-Evento: &lt;id único do envio&gt;</code>: reenvios com o mesmo id não duplicam (recomendado)</li>
            </ul>
            <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">{`{ "nome": "Maria", "email": "maria@exemplo.com", "telefone": "11 99999-0000",
  "empresa": "Clínica X", "cidade": "Recife", "mensagem": "Quero saber o preço" }`}</pre>
            <p className="text-xs text-slate-500">Respostas: 201 lead criado · 200 duplicado (já recebido) · 401 assinatura inválida · 422 dados inválidos · 404 origem revogada.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function Automacoes() {
  const abas = [
    { para: "/automacoes/regras", rotulo: "Automações" },
    { para: "/automacoes/execucoes", rotulo: "Execuções e falhas" },
    { para: "/automacoes/followup", rotulo: "Follow-up" },
    { para: "/automacoes/origens", rotulo: "Origens de captação" },
  ];
  return (
    <Pagina titulo="Automações">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {abas.map((a) => <NavLink key={a.para} to={a.para} className={({ isActive }) => `px-3 py-2 text-sm ${isActive ? "border-b-2 border-indigo-600 font-medium text-indigo-700" : "text-slate-600"}`}>{a.rotulo}</NavLink>)}
      </nav>
      <Routes>
        <Route path="regras" element={<ListaAutomacoes />} />
        <Route path="execucoes" element={<Execucoes />} />
        <Route path="followup" element={<Followups />} />
        <Route path="origens" element={<Origens />} />
        <Route path="*" element={<Navigate to="/automacoes/regras" replace />} />
      </Routes>
    </Pagina>
  );
}
