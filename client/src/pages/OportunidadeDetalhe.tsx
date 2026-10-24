import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { data, moeda } from "../lib/formato";
import { usePode } from "../lib/sessao";
import { Botao, Campo, Carregando, Cartao, Erro, Etiqueta, Pagina, Selecao } from "../components/ui";
import { FormInteracao, FormTarefa } from "../components/formularios";
import { Historico } from "../components/Historico";
import { ListaTarefas } from "../components/Tarefas";

export default function OportunidadeDetalhe() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const utils = trpc.useUtils();
  const q = trpc.pipeline.oportunidade.useQuery({ id });
  const etapas = trpc.pipeline.etapas.useQuery();
  const responsaveis = trpc.admin.responsaveis.useQuery();
  const podeExcluir = usePode("crm:excluir");
  const [tarefa, setTarefa] = useState(false);
  const [f, setF] = useState({ valor: "", previsaoFechamento: "", responsavelId: "" });
  const [motivo, setMotivo] = useState("");
  const [etapaAlvo, setEtapaAlvo] = useState("");
  useEffect(() => {
    if (q.data) setF({ valor: q.data.valor.replace(".", ","), previsaoFechamento: q.data.previsaoFechamento ?? "", responsavelId: q.data.responsavelId ?? "" });
  }, [q.data]);
  const invalidar = () => { utils.pipeline.invalidate(); utils.relatorios.invalidate(); };
  const atualizar = trpc.pipeline.atualizarOportunidade.useMutation({ onSuccess: invalidar });
  const mover = trpc.pipeline.moverEtapa.useMutation({ onSuccess: () => { invalidar(); setEtapaAlvo(""); setMotivo(""); } });
  const excluir = trpc.pipeline.excluirOportunidade.useMutation({ onSuccess: () => nav("/pipeline") });

  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Erro erro={q.error} />;
  const o = q.data;
  const alvo = etapas.data?.find((e) => e.id === etapaAlvo);
  return (
    <Pagina titulo={o.titulo} acoes={podeExcluir && <Botao variante="perigo" onClick={() => confirm("Excluir oportunidade?") && excluir.mutate({ id })}>Excluir</Botao>}>
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Etiqueta valor={o.situacao} />
        {o.empresaId && <Link className="text-indigo-700 hover:underline" to={`/empresas/${o.empresaId}`}>{o.empresa}</Link>}
        {o.contato && <span>· {o.contato}</span>} <span>· origem {o.origem ?? "—"}</span>
        {o.motivoPerda && <span>· perdida: {o.motivoPerda}</span>}
        {o.fechadaEm && <span>· encerrada em {data(o.fechadaEm)}</span>}
      </p>
      <Erro erro={atualizar.error ?? mover.error ?? excluir.error} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Cartao titulo="Histórico">
            <div className="mb-4"><FormInteracao vinculo={{ oportunidadeId: id }} /></div>
            <Historico itens={o.interacoes} />
          </Cartao>
        </div>
        <div className="space-y-4">
          <Cartao titulo="Etapa">
            <div className="space-y-2">
              <Selecao value={etapaAlvo || o.etapaId} onChange={(e) => setEtapaAlvo(e.target.value)} aria-label="Etapa">
                {etapas.data?.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </Selecao>
              {alvo?.tipo === "perdida" && <Campo rotulo="Motivo da perda *" value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
              {etapaAlvo && etapaAlvo !== o.etapaId && <Botao className="w-full" carregando={mover.isPending} onClick={() => mover.mutate({ id, etapaId: etapaAlvo, motivoPerda: motivo || undefined })}>Mover para {alvo?.nome}</Botao>}
            </div>
          </Cartao>
          <Cartao titulo="Dados">
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); atualizar.mutate({ id, valor: f.valor, previsaoFechamento: f.previsaoFechamento || null, responsavelId: f.responsavelId || null }); }}>
              <Campo rotulo="Valor mensal (R$)" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
              <Campo rotulo="Previsão de fechamento" type="date" value={f.previsaoFechamento} onChange={(e) => setF({ ...f, previsaoFechamento: e.target.value })} />
              <Selecao rotulo="Responsável" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
                <option value="">—</option>{responsaveis.data?.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </Selecao>
              <p className="text-xs text-slate-500">Atual: {moeda(o.valor)}/mês. Oportunidade não é receita: só vira receita quando há contrato e recebimento.</p>
              <Botao className="w-full" variante="secundario" carregando={atualizar.isPending}>Salvar alterações</Botao>
            </form>
          </Cartao>
          <Cartao titulo="Tarefas" acoes={<Botao variante="secundario" onClick={() => setTarefa(true)}>+</Botao>}><ListaTarefas tarefas={o.tarefas} /></Cartao>
        </div>
      </div>
      <FormTarefa aberto={tarefa} aoFechar={() => setTarefa(false)} vinculo={{ oportunidadeId: id, empresaId: o.empresaId, contatoId: o.contatoId }} />
    </Pagina>
  );
}
