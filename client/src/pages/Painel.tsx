import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { data, hojeISO, inicioDoMesISO, moeda, pct } from "../lib/formato";
import { Campo, Carregando, Cartao, Erro, Indicador, Pagina, Vazio } from "../components/ui";

export default function Painel() {
  const [de, setDe] = useState(inicioDoMesISO());
  const [ate, setAte] = useState(hojeISO());
  const ind = trpc.relatorios.indicadores.useQuery({ de, ate });
  const tarefas = trpc.pipeline.tarefas.useQuery({ escopo: "minhas", situacao: "pendentes" });
  const vencendo = trpc.contratos.listar.useQuery({ vencimento: "30" });
  const d = ind.data;
  const maxEtapa = Math.max(1, ...(d?.porEtapa.map((e) => Number(e.valor)) ?? [1]));

  return (
    <Pagina titulo="Painel comercial" acoes={
      <div className="flex items-end gap-2">
        <Campo rotulo="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
      </div>
    }>
      <Erro erro={ind.error} tentar={() => ind.refetch()} />
      {ind.isLoading ? <Carregando /> : d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador rotulo="Pipeline aberto" valor={moeda(d.pipelineAberto)} detalhe={`Ponderado: ${moeda(d.pipelinePonderado)}`} />
            <Indicador rotulo="Vendas no período" valor={moeda(d.ganhas.valor)} detalhe={`${d.ganhas.quantidade} ganhas · ticket ${d.ticketMedio ? moeda(d.ticketMedio) : "—"}`} />
            <Indicador rotulo="Conversão" valor={pct(d.taxaConversao)} detalhe={`${d.ganhas.quantidade} ganhas / ${d.ganhas.quantidade + d.perdidas.quantidade} decididas`} />
            <Indicador rotulo="MRR contratado" valor={moeda(d.mrrContratado)} detalhe="Contratos ativos (não é dinheiro recebido)" />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Cartao titulo="Oportunidades abertas por etapa" className="lg:col-span-2">
              <div className="space-y-2">
                {d.porEtapa.map((e) => (
                  <Link key={e.etapaId} to={`/pipeline`} className="block">
                    <div className="flex justify-between text-xs text-slate-600"><span>{e.etapa} ({e.quantidade})</span><span>{moeda(e.valor)}</span></div>
                    <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-indigo-500" style={{ width: `${(Number(e.valor) / maxEtapa) * 100}%` }} /></div>
                  </Link>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">{d.novas} oportunidades criadas no período · {d.tarefasAtrasadas} tarefas atrasadas no time</p>
            </Cartao>
            <Cartao titulo="Contratos vencendo em 30 dias">
              {vencendo.isLoading ? <Carregando /> : vencendo.data?.length ? (
                <ul className="space-y-2 text-sm">{vencendo.data.map((c) => <li key={c.id} className="flex justify-between"><Link className="text-indigo-700 hover:underline" to={`/empresas/${c.empresaId}`}>{c.empresa}</Link><span className="text-slate-500">{data(c.fim)}</span></li>)}</ul>
              ) : <Vazio texto="Nenhum contrato vencendo." />}
            </Cartao>
          </div>
        </>
      )}
      <Cartao titulo="Minhas tarefas pendentes" acoes={<Link to="/tarefas" className="text-xs text-indigo-700">ver todas</Link>}>
        {tarefas.isLoading ? <Carregando /> : tarefas.data?.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {tarefas.data.slice(0, 8).map((t) => (
              <li key={t.id} className="flex justify-between py-2">
                <span>{t.titulo} {t.empresa && <span className="text-slate-400">· {t.empresa}</span>}</span>
                <span className={t.venceEm && new Date(t.venceEm) < new Date() ? "text-red-600" : "text-slate-500"}>{data(t.venceEm)}</span>
              </li>
            ))}
          </ul>
        ) : <Vazio texto="Nenhuma tarefa pendente." />}
      </Cartao>
    </Pagina>
  );
}
