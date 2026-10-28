import { useState } from "react";
import { trpc } from "../lib/trpc";
import { hojeISO } from "../lib/formato";
import { Campo, Carregando, Cartao, Erro, Indicador, Pagina } from "../components/ui";

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default function RelatorioMensal() {
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const q = trpc.pro.relatorio.useQuery({ mes }, { enabled: /^\d{4}-\d{2}$/.test(mes) });
  const r = q.data;
  return (
    <Pagina titulo="Relatório mensal de resultados">
      <p className="text-sm text-slate-500">O que a recepcionista virtual fez no mês, calculado a partir das conversas, da agenda e das campanhas. É a base do relatório que a clínica recebe (plano Pro).</p>
      <div className="max-w-xs"><Campo rotulo="Mês" type="month" value={mes} onChange={(e) => setMes(e.target.value)} /></div>
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
              <Indicador rotulo="Consultas no mês" valor={r.confirmacao.consultas} detalhe={`${r.confirmacao.lembretes} com lembrete`} />
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
