import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { Botao, Campo, Carregando, Erro, Pagina, Tabela, Vazio } from "../components/ui";
import { FormContato } from "../components/formularios";
import { BotoesCsv } from "../components/Csv";

export default function Contatos() {
  const utils = trpc.useUtils();
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [novo, setNovo] = useState(false);
  const q = trpc.cadastros.contatos.useQuery({ busca: busca || undefined, pagina });
  const optout = trpc.cadastros.atualizarContato.useMutation({ onSuccess: () => utils.cadastros.contatos.invalidate() });
  const totalPaginas = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.porPagina)) : 1;
  return (
    <Pagina titulo="Contatos" acoes={<><BotoesCsv entidade="contatos" /><Botao onClick={() => setNovo(true)}>+ Contato</Botao></>}>
      <div className="w-72"><Campo rotulo="Buscar" placeholder="Nome, e-mail ou telefone" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} /></div>
      <Erro erro={q.error ?? optout.error} />
      {q.isLoading ? <Carregando /> : !q.data?.linhas.length ? <Vazio texto="Nenhum contato encontrado." /> : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Tabela colunas={["Nome", "Empresa", "E-mail", "Telefone", "Cargo", "Follow-up"]}>
            {q.data.linhas.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 font-medium">{c.nome}</td>
                <td className="px-3 py-2">{c.empresaId ? <Link className="text-indigo-700 hover:underline" to={`/empresas/${c.empresaId}`}>{c.empresa}</Link> : "—"}</td>
                <td className="px-3 py-2">{c.email ?? "—"}</td>
                <td className="px-3 py-2">{c.telefone ?? "—"}</td>
                <td className="px-3 py-2">{c.cargo ?? "—"}</td>
                <td className="px-3 py-2">
                  <button className={`text-xs underline ${c.descadastrado ? "text-red-600" : "text-slate-500"}`} onClick={() => optout.mutate({ id: c.id, descadastrado: !c.descadastrado })}>
                    {c.descadastrado ? "Descadastrado (reativar)" : "Ativo (descadastrar)"}
                  </button>
                </td>
              </tr>
            ))}
          </Tabela>
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-slate-500">
            <span>{q.data.total} contatos</span>
            <div className="flex gap-2"><Botao variante="fantasma" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</Botao><span className="py-2">{pagina}/{totalPaginas}</span><Botao variante="fantasma" disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)}>Próxima</Botao></div>
          </div>
        </div>
      )}
      <FormContato aberto={novo} aoFechar={() => setNovo(false)} />
    </Pagina>
  );
}
