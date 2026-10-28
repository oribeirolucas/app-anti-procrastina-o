import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { fimDoMesISO, hojeISO, inicioDoMesISO, moeda } from "../lib/formato";
import { useAvisar } from "../lib/aviso";
import { usePode } from "../lib/sessao";
import { Botao, Campo, Carregando, Cartao, Erro, Indicador, Pagina, Tabela, Vazio } from "../components/ui";

const valorOuTraco = (v: string | null) => (v === null ? "—" : moeda(v));

export default function Marketing() {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const gerir = usePode("config:gerir");
  const [de, setDe] = useState(inicioDoMesISO());
  const [ate, setAte] = useState(fimDoMesISO(hojeISO().slice(0, 7)));
  const q = trpc.marketing.resumo.useQuery({ de, ate }, { enabled: !!de && !!ate && ate >= de });
  const [orc, setOrc] = useState<string | null>(null);
  const salvarOrc = trpc.marketing.salvarOrcamento.useMutation({ onSuccess: () => { utils.marketing.resumo.invalidate(); setOrc(null); avisar("Orçamento diário salvo."); } });
  const r = q.data;
  const ritmo = r?.orcamentoDiario && r.gastoMedioDiario ? Number(r.gastoMedioDiario) / Number(r.orcamentoDiario) : null;
  return (
    <Pagina titulo="Marketing">
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
      </div>
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : r && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Indicador rotulo="Investimento" valor={moeda(r.gasto)} detalhe={<Link className="underline" to="/financeiro/lancamentos">despesas pagas em Marketing</Link>} />
            <Indicador rotulo="Leads" valor={r.leads} detalhe="oportunidades criadas" />
            <Indicador rotulo="CPL" valor={valorOuTraco(r.cpl)} detalhe="investimento ÷ leads" />
            <Indicador rotulo="Novos clientes" valor={r.novosClientes} detalhe="contratos iniciados" />
            <Indicador rotulo="CAC" valor={valorOuTraco(r.cac)} detalhe="investimento ÷ novos clientes" />
            <Indicador rotulo="Orçamento diário" valor={valorOuTraco(r.orcamentoDiario)}
              detalhe={<>gasto médio {moeda(r.gastoMedioDiario)}/dia{ritmo !== null && <span className={ritmo > 1 ? " font-medium text-red-700" : ""}> ({Math.round(ritmo * 100)}%)</span>}</>} />
          </div>
          <Cartao titulo="Leads por origem no período">
            {!r.porOrigem.length ? <Vazio texto="Nenhuma oportunidade criada no período." /> : (
              <Tabela colunas={["Origem", "Leads", "Ganhas", "Conversão"]}>
                {r.porOrigem.map((o) => (
                  <tr key={o.origem}>
                    <td className="px-3 py-2">{o.origem}</td><td className="px-3 py-2">{o.leads}</td><td className="px-3 py-2">{o.ganhas}</td>
                    <td className="px-3 py-2">{o.leads ? `${Math.round((o.ganhas / o.leads) * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </Tabela>
            )}
            <p className="mt-3 text-xs text-slate-500">
              O investimento vem dos lançamentos pagos na categoria Marketing. O custo por canal (Meta, Google, TikTok) entra quando a integração com as plataformas de anúncio for ligada.
            </p>
          </Cartao>
          {gerir && (
            <Cartao titulo="Orçamento diário de mídia">
              <form className="flex max-w-sm items-end gap-2" onSubmit={(e) => { e.preventDefault(); salvarOrc.mutate({ valor: orc ?? "" }); }}>
                <div className="flex-1"><Campo rotulo="Valor por dia (R$)" inputMode="decimal" required placeholder="150,00" value={orc ?? (r.orcamentoDiario?.replace(".", ",") ?? "")} onChange={(e) => setOrc(e.target.value)} /></div>
                <Botao carregando={salvarOrc.isPending}>Salvar</Botao>
              </form>
              <Erro erro={salvarOrc.error} />
            </Cartao>
          )}
        </>
      )}
    </Pagina>
  );
}
