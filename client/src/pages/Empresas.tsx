import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { Botao, Campo, Carregando, Erro, Pagina, Tabela, Vazio } from "../components/ui";
import { FormEmpresa } from "../components/formularios";
import { BotoesCsv } from "../components/Csv";

export default function Empresas() {
  const nav = useNavigate();
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [nova, setNova] = useState(false);
  const q = trpc.cadastros.empresas.useQuery({ busca: busca || undefined, pagina });
  const totalPaginas = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.porPagina)) : 1;
  return (
    <Pagina titulo="Empresas" acoes={<><BotoesCsv entidade="empresas" /><Botao onClick={() => setNova(true)}>+ Empresa</Botao></>}>
      <div className="w-72"><Campo rotulo="Buscar" placeholder="Nome, cidade ou CNPJ" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} /></div>
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !q.data?.linhas.length ? (
        <Vazio texto={busca ? "Nenhuma empresa encontrada." : "Nenhuma empresa cadastrada ainda."} acao={!busca && <Botao onClick={() => setNova(true)}>Cadastrar a primeira</Botao>} />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white">
          <Tabela colunas={["Nome", "Segmento", "Cidade", "Telefone", "Responsável", "Oport. abertas"]}>
            {q.data.linhas.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-3 py-2"><Link className="font-medium text-indigo-700 hover:underline" to={`/empresas/${e.id}`}>{e.nome}</Link></td>
                <td className="px-3 py-2">{e.segmento ?? "—"}</td>
                <td className="px-3 py-2">{e.cidade ? `${e.cidade}/${e.uf ?? ""}` : "—"}</td>
                <td className="px-3 py-2">{e.telefone ?? "—"}</td>
                <td className="px-3 py-2">{e.responsavel ?? "—"}</td>
                <td className="px-3 py-2">{e.oportunidadesAbertas}</td>
              </tr>
            ))}
          </Tabela>
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-slate-500">
            <span>{q.data.total} empresas</span>
            <div className="flex gap-2"><Botao variante="fantasma" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</Botao><span className="py-2">{pagina}/{totalPaginas}</span><Botao variante="fantasma" disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)}>Próxima</Botao></div>
          </div>
        </div>
      )}
      <FormEmpresa aberto={nova} aoFechar={() => setNova(false)} aoSalvar={(id) => nav(`/empresas/${id}`)} />
    </Pagina>
  );
}
