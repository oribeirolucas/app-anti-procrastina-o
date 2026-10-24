import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { data, moeda } from "../lib/formato";
import { somarBRL } from "../lib/somar";
import { Carregando, Erro, Etiqueta, Pagina, Selecao, Tabela, Vazio } from "../components/ui";

export default function Contratos() {
  const [dias, setDias] = useState("");
  const q = trpc.pipeline.contratos.useQuery({ vencendoEmDias: dias ? Number(dias) : undefined });
  const ativos = q.data?.filter((c) => c.situacao === "ativo") ?? [];
  return (
    <Pagina titulo="Contratos">
      <div className="flex items-end gap-4">
        <div className="w-56"><Selecao rotulo="Filtro" value={dias} onChange={(e) => setDias(e.target.value)}><option value="">Todos</option><option value="30">Vencendo em 30 dias</option><option value="60">Vencendo em 60 dias</option><option value="90">Vencendo em 90 dias</option></Selecao></div>
        <p className="pb-2 text-sm text-slate-600">MRR contratado (ativos listados): <b>{moeda(somarBRL(ativos.map((c) => c.valorMensal)))}</b></p>
      </div>
      <p className="text-xs text-slate-500">Para registrar um contrato, abra a empresa correspondente.</p>
      <Erro erro={q.error} />
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio texto="Nenhum contrato." /> : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Tabela colunas={["Empresa", "Plano", "Mensalidade", "Setup", "Início", "Vencimento", "Cobrança", "Situação"]}>
            {q.data.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2"><Link className="text-indigo-700 hover:underline" to={`/empresas/${c.empresaId}`}>{c.empresa}</Link></td>
                <td className="px-3 py-2">{c.plano}</td><td className="px-3 py-2">{moeda(c.valorMensal)}</td><td className="px-3 py-2">{moeda(c.valorSetup)}</td>
                <td className="px-3 py-2">{data(c.inicio)}</td><td className="px-3 py-2">{data(c.fim)}</td><td className="px-3 py-2">dia {c.diaVencimento}</td>
                <td className="px-3 py-2"><Etiqueta valor={c.situacao} /></td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}
    </Pagina>
  );
}
