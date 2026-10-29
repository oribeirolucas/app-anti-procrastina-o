import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { trpc } from "../lib/trpc";
import { data, moeda } from "../lib/formato";
import { Carregando, Erro, Etiqueta, Indicador, Pagina, Tabela, Vazio } from "../components/ui";

const RISCO = { alto: "Alto", medio: "Médio", baixo: "Baixo" } as const;

export default function Sucesso() {
  const q = trpc.sucesso.clientes.useQuery();
  const l = q.data ?? [];
  const emRisco = l.filter((c) => c.risco === "alto");
  const mrrRisco = emRisco.reduce((s, c) => s + Math.round(Number(c.mrr) * 100), 0) / 100;
  return (
    <Pagina titulo="Customer Success">
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !l.length ? <Vazio texto="Nenhum cliente com contrato ativo." /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Indicador rotulo="Clientes ativos" valor={l.length} />
            <Indicador rotulo="Health score médio" valor={Math.round(l.reduce((s, c) => s + c.score, 0) / l.length)} />
            <Indicador rotulo="Risco alto de churn" valor={emRisco.length} />
            <Indicador rotulo="MRR em risco" valor={moeda(mrrRisco)} detalhe="clientes com risco alto" />
          </div>
          <Tabela colunas={["Cliente", "Health score", "Risco", "Alertas", "MRR", "Último contato", "Chamados abertos"]}>
            {l.map((c) => (
              <tr key={c.empresaId} className="align-top">
                <td className="px-3 py-2"><Link className="font-medium text-indigo-700 hover:underline" to={`/empresas/${c.empresaId}`}>{c.nome}</Link><div className="text-xs text-slate-500">{c.planos}</div></td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 font-semibold text-slate-800">{c.score}</span>
                    <div className="h-2 w-20 rounded bg-slate-100"><div className={`h-2 rounded ${c.risco === "alto" ? "bg-red-600" : c.risco === "medio" ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${c.score}%` }} /></div>
                  </div>
                </td>
                <td className="px-3 py-2"><Etiqueta valor={c.risco} texto={RISCO[c.risco]} /></td>
                <td className="px-3 py-2">
                  {c.alertas.length ? <ul className="space-y-0.5 text-xs text-slate-700">{c.alertas.map((a) => <li key={a.codigo} className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-600" />{a.texto}</li>)}</ul> : <span className="text-xs text-slate-400">nenhum</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{moeda(c.mrr)}</td>
                <td className="whitespace-nowrap px-3 py-2">{c.ultimoContato ? data(c.ultimoContato.slice(0, 10)) : "nunca"}</td>
                <td className="px-3 py-2 text-slate-400" title="Chamados entram com o canal de suporte (WhatsApp)">—</td>
              </tr>
            ))}
          </Tabela>
          <p className="text-xs text-slate-500">
            Health score por regras auditáveis (docs/INDICADORES.md): começa em 100 e desconta por cobrança vencida, tempo sem contato, tarefas atrasadas e renovação próxima.
            A análise da IA sobre as conversas e os chamados de suporte entram com o agente de CS e o WhatsApp.
          </p>
        </>
      )}
    </Pagina>
  );
}
