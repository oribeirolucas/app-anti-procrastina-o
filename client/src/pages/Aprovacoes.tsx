import { useState } from "react";
import { Check, X } from "lucide-react";
import { trpc } from "../lib/trpc";
import { dataHora, moeda } from "../lib/formato";
import { useAvisar } from "../lib/aviso";
import { usePode } from "../lib/sessao";
import { Botao, Campo, Carregando, Cartao, Erro, Etiqueta, Modal, Pagina, Vazio } from "../components/ui";

const TIPOS: Record<string, string> = { orcamento: "Orçamento", desconto: "Desconto comercial", deploy: "Deploy", outro: "Outro" };
type Situacao = "pendente" | "aprovada" | "recusada";

export default function Aprovacoes() {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const decidirPode = usePode("aprovacoes:decidir");
  const [situacao, setSituacao] = useState<Situacao>("pendente");
  const q = trpc.aprovacoes.listar.useQuery({ situacao }, { refetchInterval: 30_000 });
  const [recusando, setRecusando] = useState<{ id: string; versao: number; titulo: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const decidir = trpc.aprovacoes.decidir.useMutation({
    onSuccess: (s) => { utils.aprovacoes.listar.invalidate(); avisar(s.situacao === "aprovada" ? "Aprovado (Go)." : "Recusado (No-Go)."); setRecusando(null); setMotivo(""); },
  });
  return (
    <Pagina titulo="Aprovações">
      <p className="text-sm text-slate-500">Decisões que os agentes de IA não podem tomar sozinhos. Nada é executado sem o seu Go.</p>
      <nav className="flex gap-1 border-b border-slate-200">
        {(["pendente", "aprovada", "recusada"] as const).map((s) => (
          <button key={s} onClick={() => setSituacao(s)} className={`px-3 py-2 text-sm ${situacao === s ? "border-b-2 border-indigo-600 font-medium text-indigo-700" : "text-slate-600"}`}>
            {s === "pendente" ? `Pendentes${q.data && situacao === "pendente" ? ` (${q.data.pendentes})` : ""}` : s === "aprovada" ? "Aprovadas" : "Recusadas"}
          </button>
        ))}
      </nav>
      <Erro erro={q.error ?? decidir.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !q.data?.itens.length ? (
        <Vazio texto={situacao === "pendente" ? "Nenhuma decisão aguardando você. As solicitações dos agentes aparecem aqui." : "Nada por aqui ainda."} />
      ) : (
        <ul className="space-y-3">
          {q.data.itens.map((s) => (
            <li key={s.id}>
              <Cartao>
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Etiqueta valor={s.situacao} />
                      <span className="font-medium text-slate-700">{TIPOS[s.tipo] ?? s.tipo}</span>
                      <span>· {s.agente ? `pedido por ${s.agente}` : "origem não informada"} · {dataHora(s.criadoEm)}</span>
                    </div>
                    <h3 className="font-semibold text-slate-800">{s.titulo}</h3>
                    {s.descricao && <p className="whitespace-pre-line text-sm text-slate-600">{s.descricao}</p>}
                    {s.valor && <p className="text-sm text-slate-700">Valor envolvido: <strong>{moeda(s.valor)}</strong></p>}
                    {s.situacao !== "pendente" && (
                      <p className="text-xs text-slate-500">Decidido por {s.decididoPor ?? "—"} em {dataHora(s.decididoEm)}{s.motivoDecisao ? `: ${s.motivoDecisao}` : ""}</p>
                    )}
                  </div>
                  {s.situacao === "pendente" && decidirPode && (
                    <div className="flex shrink-0 gap-2">
                      <Botao variante="secundario" disabled={decidir.isPending} onClick={() => setRecusando({ id: s.id, versao: s.versao, titulo: s.titulo })}><X className="h-4 w-4" /> No-Go</Botao>
                      <Botao disabled={decidir.isPending} onClick={() => confirm(`Aprovar: ${s.titulo}?`) && decidir.mutate({ id: s.id, versao: s.versao, decisao: "aprovar" })}><Check className="h-4 w-4" /> Go</Botao>
                    </div>
                  )}
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
      <Modal titulo="Recusar (No-Go)" aberto={!!recusando} aoFechar={() => setRecusando(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (recusando) decidir.mutate({ id: recusando.id, versao: recusando.versao, decisao: "recusar", motivo }); }}>
          <p className="text-sm text-slate-600">{recusando?.titulo}</p>
          <Campo rotulo="Motivo *" required minLength={3} maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="O agente usa o motivo para ajustar a próxima proposta" />
          <Erro erro={decidir.error} />
          <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={() => setRecusando(null)}>Cancelar</Botao><Botao variante="perigo" carregando={decidir.isPending}>Recusar</Botao></div>
        </form>
      </Modal>
    </Pagina>
  );
}
