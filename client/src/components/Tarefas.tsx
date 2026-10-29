import { trpc } from "../lib/trpc";
import { dataHora } from "../lib/formato";
import { Vazio } from "./ui";

type T = { id: string; titulo: string; venceEm: string | Date | null; concluida: boolean; origem: string };
export function ListaTarefas({ tarefas }: { tarefas: T[] }) {
  const utils = trpc.useUtils();
  const concluir = trpc.pipeline.concluirTarefa.useMutation({ onSuccess: () => { utils.pipeline.invalidate(); utils.cadastros.empresa.invalidate(); } });
  if (!tarefas.length) return <Vazio texto="Nenhuma tarefa." />;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {tarefas.map((t) => (
        <li key={t.id} className="flex items-center gap-2 py-2">
          <input type="checkbox" checked={t.concluida} onChange={(e) => concluir.mutate({ id: t.id, concluida: e.target.checked })} aria-label="Concluir" />
          <span className={t.concluida ? "text-slate-400 line-through" : ""}>{t.titulo}</span>
          {t.origem !== "manual" && <span className="rounded bg-amber-100 px-1 text-xs text-amber-700">{t.origem}</span>}
          <span className={`ml-auto text-xs ${!t.concluida && t.venceEm && new Date(t.venceEm) < new Date() ? "text-red-600" : "text-slate-500"}`}>{dataHora(t.venceEm)}</span>
        </li>
      ))}
    </ul>
  );
}
