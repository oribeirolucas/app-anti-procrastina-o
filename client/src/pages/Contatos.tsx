import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { Botao, Campo, Carregando, Erro, Pagina, Tabela, Vazio } from "../components/ui";
import { FormContato } from "../components/formularios";
import { BotoesCsv } from "../components/Csv";
import { useAvisar } from "../lib/aviso";
import { usePode } from "../lib/sessao";

export default function Contatos() {
  const utils = trpc.useUtils();
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [novo, setNovo] = useState(false);
  const [arquivados, setArquivados] = useState(false);
  const avisar = useAvisar();
  const podeAnonimizar = usePode("dados:anonimizar");
  const podeArquivar = usePode("crm:arquivar");
  const q = trpc.cadastros.contatos.useQuery({ busca: busca || undefined, pagina, arquivados });
  const aoMudar = (msg: string) => ({ onSuccess: () => { utils.cadastros.contatos.invalidate(); avisar(msg); }, onError: (e: { message: string }) => avisar(e.message, "erro") });
  const optout = trpc.cadastros.definirDescadastro.useMutation(aoMudar("Preferência de contato atualizada."));
  const arquivar = trpc.cadastros.arquivarContato.useMutation(aoMudar("Contato atualizado."));
  const anonimizar = trpc.cadastros.anonimizarContato.useMutation(aoMudar("Dados pessoais removidos."));
  const totalPaginas = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.porPagina)) : 1;
  return (
    <Pagina titulo="Contatos" acoes={<><BotoesCsv entidade="contatos" /><Botao onClick={() => setNovo(true)}>+ Contato</Botao></>}>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-72"><Campo rotulo="Buscar" placeholder="Nome, e-mail ou telefone" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} /></div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600"><input type="checkbox" checked={arquivados} onChange={(e) => { setArquivados(e.target.checked); setPagina(1); }} /> Mostrar arquivados</label>
      </div>
      <Erro erro={q.error} />
      {q.isLoading ? <Carregando /> : !q.data?.linhas.length ? <Vazio texto="Nenhum contato encontrado." /> : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Tabela colunas={["Nome", "Empresa", "E-mail", "Telefone", "Cargo", "Follow-up", ""]}>
            {q.data.linhas.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 font-medium">{c.nome}</td>
                <td className="px-3 py-2">{c.empresaId ? <Link className="text-indigo-700 hover:underline" to={`/empresas/${c.empresaId}`}>{c.empresa}</Link> : "—"}</td>
                <td className="px-3 py-2">{c.email ?? "—"}</td>
                <td className="px-3 py-2">{c.telefone ?? "—"}</td>
                <td className="px-3 py-2">{c.cargo ?? "—"}</td>
                <td className="px-3 py-2">
                  {c.anonimizadoEm ? <span className="text-xs text-slate-400">anonimizado</span> : (
                    <button disabled={optout.isPending} className={`text-xs underline ${c.descadastrado ? "text-red-600" : "text-slate-500"}`} onClick={() => optout.mutate({ id: c.id, descadastrado: !c.descadastrado })}>
                      {c.descadastrado ? "Descadastrado (reativar)" : "Ativo (descadastrar)"}
                    </button>
                  )}
                </td>
                <td className="space-x-3 whitespace-nowrap px-3 py-2 text-xs">
                  {podeArquivar && !c.anonimizadoEm && <button className="underline" onClick={() => arquivar.mutate({ id: c.id, arquivar: !arquivados })}>{arquivados ? "Reativar" : "Arquivar"}</button>}
                  {podeAnonimizar && !c.anonimizadoEm && (
                    <button className="text-red-600 underline" onClick={() => prompt(`Anonimizar remove nome, e-mail, telefone e textos de ${c.nome} de forma IRREVERSÍVEL. Digite ANONIMIZAR para confirmar:`) === "ANONIMIZAR" && anonimizar.mutate({ id: c.id })}>Anonimizar (LGPD)</button>
                  )}
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
