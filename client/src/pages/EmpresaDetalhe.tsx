import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { data, moeda } from "../lib/formato";
import { usePode } from "../lib/sessao";
import { Botao, Carregando, Cartao, Erro, Etiqueta, Pagina, Vazio } from "../components/ui";
import { FormContato, FormInteracao, FormOportunidade, FormTarefa } from "../components/formularios";
import { FormContrato } from "../components/FormContrato";
import { Historico } from "../components/Historico";
import { ListaTarefas } from "../components/Tarefas";
import { useAvisar } from "../lib/aviso";

export default function EmpresaDetalhe() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const q = trpc.cadastros.empresa.useQuery({ id });
  const podeContrato = usePode("contratos:escrever");
  const podeArquivar = usePode("crm:arquivar");
  const avisar = useAvisar();
  const utils = trpc.useUtils();
  const [modal, setModal] = useState<"contato" | "oportunidade" | "tarefa" | "contrato" | null>(null);
  const [contratoEdit, setContratoEdit] = useState<NonNullable<typeof q.data>["contratos"][number] | null>(null);
  const arquivar = trpc.cadastros.arquivarEmpresa.useMutation({
    onSuccess: (e) => { avisar(e.arquivadoEm ? "Empresa arquivada." : "Empresa reativada."); utils.cadastros.invalidate(); if (e.arquivadoEm) nav("/empresas"); },
  });

  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Erro erro={q.error} />;
  const e = q.data;
  return (
    <Pagina titulo={e.nome} acoes={podeArquivar && (e.arquivadoEm
      ? <Botao variante="secundario" carregando={arquivar.isPending} onClick={() => arquivar.mutate({ id, arquivar: false })}>Reativar</Botao>
      : <Botao variante="secundario" carregando={arquivar.isPending} onClick={() => confirm("Arquivar esta empresa? O histórico é mantido e você pode reativá-la depois.") && arquivar.mutate({ id, arquivar: true })}>Arquivar</Botao>)}>
      {e.arquivadoEm && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">Empresa arquivada. Reative para abrir novas oportunidades.</p>}
      <Erro erro={arquivar.error} />
      <p className="text-sm text-slate-500">{[e.segmento, e.cidade && `${e.cidade}/${e.uf ?? ""}`, e.telefone, e.documento && `CNPJ ${e.documento}`].filter(Boolean).join(" · ") || "Sem dados adicionais"}</p>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Cartao titulo="Oportunidades" acoes={<Botao variante="secundario" onClick={() => setModal("oportunidade")}>+ Oportunidade</Botao>}>
            {e.oportunidades.length ? (
              <ul className="divide-y divide-slate-100 text-sm">{e.oportunidades.map((o) => (
                <li key={o.id} className="flex items-center justify-between py-2"><Link className="text-indigo-700 hover:underline" to={`/oportunidades/${o.id}`}>{o.titulo}</Link><span className="flex items-center gap-2">{moeda(o.valor)}/mês <Etiqueta valor={o.situacao} /></span></li>
              ))}</ul>
            ) : <Vazio texto="Nenhuma oportunidade." />}
          </Cartao>
          <Cartao titulo="Contratos" acoes={podeContrato && <Botao variante="secundario" onClick={() => { setContratoEdit(null); setModal("contrato"); }}>+ Contrato</Botao>}>
            {e.contratos.length ? (
              <ul className="divide-y divide-slate-100 text-sm">{e.contratos.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{c.plano} · {moeda(c.valorMensal)}/mês · {data(c.inicio)} → {data(c.fim)}</span>
                  <span className="flex items-center gap-2"><Etiqueta valor={c.situacao} />{podeContrato && c.situacao !== "cancelado" && <button className="text-xs underline" onClick={() => { setContratoEdit(c); setModal("contrato"); }}>editar</button>}<Link className="text-xs underline" to={`/contratos?situacao=todos&busca=${encodeURIComponent(e.nome)}`}>gerenciar</Link></span>
                </li>
              ))}</ul>
            ) : <Vazio texto="Nenhum contrato." />}
          </Cartao>
          <Cartao titulo="Histórico">
            <div className="mb-4"><FormInteracao vinculo={{ empresaId: id }} /></div>
            <Historico itens={e.interacoes} />
          </Cartao>
        </div>
        <div className="space-y-4">
          <Cartao titulo="Contatos" acoes={<Botao variante="secundario" onClick={() => setModal("contato")}>+</Botao>}>
            {e.contatos.length ? <ul className="space-y-2 text-sm">{e.contatos.map((c) => (
              <li key={c.id}><div className="font-medium">{c.nome} {c.descadastrado && <span className="text-xs text-red-600">(opt-out)</span>}</div><div className="text-xs text-slate-500">{[c.cargo, c.email, c.telefone].filter(Boolean).join(" · ")}</div></li>
            ))}</ul> : <Vazio texto="Nenhum contato." />}
          </Cartao>
          <Cartao titulo="Tarefas" acoes={<Botao variante="secundario" onClick={() => setModal("tarefa")}>+</Botao>}><ListaTarefas tarefas={e.tarefas} /></Cartao>
        </div>
      </div>
      <FormContato aberto={modal === "contato"} aoFechar={() => setModal(null)} empresaId={id} />
      <FormOportunidade aberto={modal === "oportunidade"} aoFechar={() => setModal(null)} empresaId={id} />
      <FormTarefa aberto={modal === "tarefa"} aoFechar={() => setModal(null)} vinculo={{ empresaId: id }} />
      {modal === "contrato" && <FormContrato aoFechar={() => setModal(null)} empresaId={id} contrato={contratoEdit} />}
    </Pagina>
  );
}
