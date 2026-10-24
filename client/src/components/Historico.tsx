import { dataHora } from "../lib/formato";
import { Vazio } from "./ui";

type Item = { id: string; tipo: string; descricao: string; criadoEm: string | Date; usuario: string | null; respostaDoContato?: boolean };
const ROTULO: Record<string, string> = { nota: "Nota", ligacao: "Ligação", email: "E-mail", whatsapp: "WhatsApp", reuniao: "Reunião", alteracao: "Alteração", chat_ia: "Chat IA", automacao: "Automação" };

export function Historico({ itens }: { itens: Item[] }) {
  if (!itens.length) return <Vazio texto="Nenhuma interação registrada." />;
  return (
    <ol className="space-y-3">
      {itens.map((i) => (
        <li key={i.id} className={`border-l-2 pl-3 ${i.tipo === "alteracao" ? "border-slate-200" : "border-indigo-300"}`}>
          <div className="text-xs text-slate-500">
            <span className="font-medium text-slate-700">{ROTULO[i.tipo] ?? i.tipo}</span> · {dataHora(i.criadoEm)} {i.usuario && `· ${i.usuario}`}
            {i.respostaDoContato && <span className="ml-1 rounded bg-emerald-100 px-1 text-emerald-700">respondeu</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{i.descricao}</p>
        </li>
      ))}
    </ol>
  );
}
