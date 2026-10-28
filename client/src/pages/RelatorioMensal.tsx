import { useState } from "react";
import { trpc } from "../lib/trpc";
import { hojeISO } from "../lib/formato";
import { Campo, Carregando, Cartao, Erro, Indicador, Pagina, Selecao } from "../components/ui";
import { FiltroUnidade } from "../components/Unidades";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default function RelatorioMensal() {
  const [periodo, setPeriodo] = useState<"mes" | "semana">("mes");
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [fimSemana, setFimSemana] = useState(hojeISO());
  const [unidadeId, setUnidadeId] = useState("");
  const inicioSemana = (() => { const [a, m, d] = fimSemana.split("-").map(Number); return new Date(Date.UTC(a, m - 1, d - 6)).toISOString().slice(0, 10); })();
  const filtro = periodo === "mes" ? { mes } : { de: inicioSemana, ate: fimSemana };
  const q = trpc.pro.relatorio.useQuery({ ...filtro, unidadeId: unidadeId || undefined }, { enabled: periodo === "mes" ? /^\d{4}-\d{2}$/.test(mes) : /^\d{4}-\d{2}-\d{2}$/.test(fimSemana) });
  const r = q.data;
  return (
    <Pagina titulo="Relatório de resultados">
      <p className="text-sm text-slate-500">O que a recepcionista virtual fez no período, calculado a partir das conversas, da agenda e das campanhas. Mensal (plano Pro) ou semanal por unidade (plano Rede).</p>
      <div className="flex flex-wrap items-end gap-3">
        <Selecao rotulo="Período" value={periodo} onChange={(e) => setPeriodo(e.target.value as "mes" | "semana")}><option value="mes">Mensal</option><option value="semana">Semanal (7 dias)</option></Selecao>
        {periodo === "mes" ? <Campo rotulo="Mês" type="month" value={mes} onChange={(e) => setMes(e.target.value)} /> : <Campo rotulo="Semana terminando em" type="date" value={fimSemana} onChange={(e) => setFimSemana(e.target.value)} />}
        <FiltroUnidade valor={unidadeId} aoMudar={setUnidadeId} todas="Todas as unidades" />
      </div>
      {periodo === "semana" && <p className="text-xs text-slate-500">De {inicioSemana.split("-").reverse().join("/")} a {fimSemana.split("-").reverse().join("/")}.</p>}
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : r && (
        <>
          <Cartao titulo="Atendimento">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Indicador rotulo="Conversas" valor={r.atendimento.conversas} />
              <Indicador rotulo="Mensagens de pacientes" valor={r.atendimento.recebidas} />
              <Indicador rotulo="Fora do horário" valor={r.atendimento.foraDoHorario} detalhe={`${pct(r.atendimento.foraDoHorario, r.atendimento.recebidas)} das mensagens (antes das 8h, depois das 18h ou fim de semana)`} />
              <Indicador rotulo="Respostas da IA" valor={r.atendimento.respostasIa} />
            </div>
          </Cartao>
          <Cartao titulo="Novos contatos e retomada">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Indicador rotulo="Novos contatos pelo WhatsApp" valor={r.leads.novos} />
              <Indicador rotulo="Avançaram no funil" valor={r.leads.avancaram} detalhe={pct(r.leads.avancaram, r.leads.novos)} />
              <Indicador rotulo="Retomadas enviadas" valor={r.retomada.enviadas} />
              <Indicador rotulo="Responderam à retomada" valor={r.retomada.responderam} detalhe={pct(r.retomada.responderam, r.retomada.enviadas)} />
            </div>
          </Cartao>
          <Cartao titulo="Confirmação de consultas">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Indicador rotulo="Consultas no período" valor={r.confirmacao.consultas} detalhe={`${r.confirmacao.lembretes} com lembrete`} />
              <Indicador rotulo="Confirmadas" valor={r.confirmacao.confirmadas} detalhe={pct(r.confirmacao.confirmadas, r.confirmacao.lembretes)} />
              <Indicador rotulo="Avisaram que não vão / remarcar" valor={r.confirmacao.canceladas + r.confirmacao.remarcar} detalhe="vagas que a recepção pôde reaproveitar" />
              <Indicador rotulo="Faltas" valor={r.confirmacao.faltas} detalhe={`${r.confirmacao.semResposta} sem resposta ao lembrete`} />
            </div>
          </Cartao>
          <Cartao titulo="Reativação">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Indicador rotulo="Pacientes contatados" valor={r.reativacao.enviados} />
              <Indicador rotulo="Responderam" valor={r.reativacao.responderam} detalhe={pct(r.reativacao.responderam, r.reativacao.enviados)} />
            </div>
          </Cartao>
        </>
      )}
    </Pagina>
  );
}
