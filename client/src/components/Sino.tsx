import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { dataHora } from "../lib/formato";

export function Sino() {
  const utils = trpc.useUtils();
  const q = trpc.automacoes.notificacoes.useQuery(undefined, { refetchInterval: 60_000 });
  const marcar = trpc.automacoes.marcarLidas.useMutation({ onSuccess: () => utils.automacoes.notificacoes.invalidate() });
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);
  const n = q.data?.naoLidas ?? 0;
  return (
    <div className="relative" ref={caixa}>
      <button onClick={() => setAberto((v) => !v)} className="relative rounded px-2 py-1 text-slate-600 hover:bg-slate-100" aria-label={`Notificações${n ? `, ${n} não lidas` : ""}`}>
        🔔{n > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 text-[10px] font-semibold text-white">{n > 99 ? "99+" : n}</span>}
      </button>
      {aberto && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2 text-sm font-semibold text-slate-700">
            Notificações {n > 0 && <button className="text-xs font-normal underline" onClick={() => marcar.mutate({})}>marcar todas como lidas</button>}
          </div>
          <ul className="max-h-96 divide-y overflow-y-auto text-sm">
            {!q.data?.itens.length && <li className="p-4 text-center text-slate-500">Nenhuma notificação.</li>}
            {q.data?.itens.map((x) => {
              const conteudo = (<><div className={x.lidaEm ? "text-slate-500" : "font-medium text-slate-800"}>{x.titulo}</div><div className="text-xs text-slate-400">{x.mensagem} · {dataHora(x.criadoEm)}</div></>);
              return (
                <li key={x.id} className={x.lidaEm ? "" : "bg-indigo-50/50"}>
                  {x.link
                    ? <Link to={x.link} className="block px-3 py-2 hover:bg-slate-50" onClick={() => { setAberto(false); if (!x.lidaEm) marcar.mutate({ ids: [x.id] }); }}>{conteudo}</Link>
                    : <button className="block w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => !x.lidaEm && marcar.mutate({ ids: [x.id] })}>{conteudo}</button>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
