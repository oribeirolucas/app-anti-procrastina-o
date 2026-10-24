import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { dataHora } from "../lib/formato";
import { Botao, Carregando, Erro, Pagina, Selecao, Tabela, Vazio } from "../components/ui";
import { FormTarefa } from "../components/formularios";

export default function Tarefas() {
  const utils = trpc.useUtils();
  const [escopo, setEscopo] = useState<"minhas" | "todas">("minhas");
  const [situacao, setSituacao] = useState<"pendentes" | "atrasadas" | "concluidas">("pendentes");
  const [nova, setNova] = useState(false);
  const q = trpc.pipeline.tarefas.useQuery({ escopo, situacao });
  const concluir = trpc.pipeline.concluirTarefa.useMutation({ onSuccess: () => utils.pipeline.tarefas.invalidate() });
  return (
    <Pagina titulo="Tarefas e lembretes" acoes={<Botao onClick={() => setNova(true)}>+ Tarefa</Botao>}>
      <div className="flex gap-2">
        <div className="w-40"><Selecao value={escopo} onChange={(e) => setEscopo(e.target.value as typeof escopo)} aria-label="Escopo"><option value="minhas">Minhas</option><option value="todas">Todo o time</option></Selecao></div>
        <div className="w-40"><Selecao value={situacao} onChange={(e) => setSituacao(e.target.value as typeof situacao)} aria-label="Situação"><option value="pendentes">Pendentes</option><option value="atrasadas">Atrasadas</option><option value="concluidas">Concluídas</option></Selecao></div>
      </div>
      <Erro erro={q.error ?? concluir.error} />
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio texto="Nada por aqui." /> : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Tabela colunas={["", "Tarefa", "Vínculo", "Responsável", "Vence", "Origem"]}>
            {q.data.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2"><input type="checkbox" checked={t.concluida} aria-label="Concluir" onChange={(e) => concluir.mutate({ id: t.id, concluida: e.target.checked })} /></td>
                <td className="px-3 py-2">{t.titulo}</td>
                <td className="px-3 py-2">
                  {t.oportunidadeId ? <Link className="text-indigo-700 hover:underline" to={`/oportunidades/${t.oportunidadeId}`}>{t.oportunidade}</Link>
                    : t.empresaId ? <Link className="text-indigo-700 hover:underline" to={`/empresas/${t.empresaId}`}>{t.empresa}</Link> : "—"}
                </td>
                <td className="px-3 py-2">{t.responsavel}</td>
                <td className={`px-3 py-2 ${!t.concluida && t.venceEm && new Date(t.venceEm) < new Date() ? "text-red-600" : ""}`}>{dataHora(t.venceEm)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{t.origem}</td>
              </tr>
            ))}
          </Tabela>
        </div>
      )}
      <FormTarefa aberto={nova} aoFechar={() => setNova(false)} vinculo={{}} />
    </Pagina>
  );
}
