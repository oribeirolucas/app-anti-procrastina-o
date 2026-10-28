import { useEffect, useRef, useState } from "react";
import { Bot, User, UserCog } from "lucide-react";
import { trpc } from "../lib/trpc";
import { dataHora } from "../lib/formato";
import { Carregando, Erro, Etiqueta, Pagina, Vazio } from "../components/ui";

const AUTOR = {
  cliente: { rotulo: "Cliente", icone: User, classe: "bg-white border border-slate-200 self-start" },
  ia: { rotulo: "IA", icone: Bot, classe: "bg-violet-50 border border-violet-200 self-end" },
  humano: { rotulo: "Humano", icone: UserCog, classe: "bg-sky-50 border border-sky-200 self-end" },
} as const;

function Dialogo({ conversaId }: { conversaId: string }) {
  // Atualiza a cada 5 s: a auditoria acompanha a conversa enquanto ela acontece
  const q = trpc.inbox.mensagens.useQuery({ conversaId }, { refetchInterval: 5_000 });
  const fim = useRef<HTMLDivElement>(null);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [q.data?.length]);
  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} tentar={() => q.refetch()} />;
  if (!q.data?.length) return <Vazio texto="Sem mensagens nesta conversa." />;
  return (
    <div className="flex flex-col gap-2">
      {q.data.map((m) => {
        const a = AUTOR[m.autor as keyof typeof AUTOR] ?? AUTOR.cliente;
        return (
          <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${a.classe}`}>
            <div className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-500"><a.icone className="h-3 w-3" />{a.rotulo} · {dataHora(m.criadoEm)}</div>
            <p className="whitespace-pre-line text-slate-800">{m.texto}</p>
          </div>
        );
      })}
      <div ref={fim} />
    </div>
  );
}

export default function Inbox() {
  const [situacao, setSituacao] = useState<"ativas" | "encerrada">("ativas");
  const q = trpc.inbox.conversas.useQuery({ situacao }, { refetchInterval: 10_000 });
  const [abertas, setAbertas] = useState<string[]>([]);
  const alternar = (id: string) => setAbertas((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id].slice(-3)));
  return (
    <Pagina titulo="Inbox WhatsApp">
      <p className="text-sm text-slate-500">Auditoria das conversas entre a IA e os clientes. Abra até 3 conversas lado a lado. Elas se atualizam sozinhas.</p>
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        O WhatsApp ainda não está conectado (requer a API oficial da Meta). As conversas aparecem aqui assim que a integração for ativada.
      </p>
      <div className="flex gap-1 border-b border-slate-200">
        {(["ativas", "encerrada"] as const).map((s) => (
          <button key={s} onClick={() => setSituacao(s)} className={`px-3 py-2 text-sm ${situacao === s ? "border-b-2 border-indigo-600 font-medium text-indigo-700" : "text-slate-600"}`}>{s === "ativas" ? "Ativas" : "Encerradas"}</button>
        ))}
      </div>
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio texto="Nenhuma conversa." /> : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {q.data.map((c) => (
              <li key={c.id}>
                <button onClick={() => alternar(c.id)} className={`w-full px-3 py-2 text-left hover:bg-slate-50 ${abertas.includes(c.id) ? "bg-indigo-50" : ""}`} aria-pressed={abertas.includes(c.id)}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-slate-800">{c.nome}</span><Etiqueta valor={c.situacao} /></div>
                  <div className="truncate text-xs text-slate-500">{c.ultima ?? "—"}</div>
                  <div className="text-[11px] text-slate-400">{c.agente ?? "sem agente"} · {dataHora(c.ultimaMensagemEm)}</div>
                </button>
              </li>
            ))}
          </ul>
          {abertas.length === 0 ? <Vazio texto="Selecione conversas à esquerda para acompanhar." /> : (
            <div className={`grid gap-3 ${abertas.length === 1 ? "" : abertas.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
              {abertas.map((id) => {
                const c = q.data.find((x) => x.id === id);
                return (
                  <section key={id} className="flex max-h-[70vh] flex-col rounded-lg border border-slate-200 bg-slate-50">
                    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
                      <h3 className="truncate text-sm font-semibold text-slate-800">{c?.nome ?? "Conversa"}</h3>
                      <button className="text-xs text-slate-500 underline" onClick={() => alternar(id)}>fechar</button>
                    </header>
                    <div className="flex-1 overflow-y-auto p-3"><Dialogo conversaId={id} /></div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Pagina>
  );
}
