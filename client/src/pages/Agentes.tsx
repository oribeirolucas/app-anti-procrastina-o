import { useState } from "react";
import { Bot, History, Plus } from "lucide-react";
import { trpc, type Saidas } from "../lib/trpc";
import { dataHora } from "../lib/formato";
import { useAvisar } from "../lib/aviso";
import { AreaTexto, Botao, Campo, Carregando, Cartao, Erro, Etiqueta, Modal, Pagina, Selecao, Tabela, Vazio } from "../components/ui";

type Agente = Saidas["agentes"]["listar"][number];
const AREAS = { marketing: "Marketing", comercial: "Comercial", cs: "Customer Success", financeiro: "Financeiro" } as const;
const PROVEDORES = { anthropic: "Claude (Anthropic)", openai: "ChatGPT (OpenAI)", google: "Gemini (Google)" } as const;
// Sugestões apenas para Claude; para os demais, informe o ID exato da documentação do provedor.
const MODELOS_SUGERIDOS: Record<string, string[]> = { anthropic: ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5"], openai: [], google: [] };
const vazio = { nome: "", area: "comercial" as keyof typeof AREAS, systemPrompt: "", provedor: "anthropic" as keyof typeof PROVEDORES, modelo: "claude-sonnet-5-5", ativo: false };

function FormAgente({ agente, aoFechar }: { agente: Agente | null; aoFechar: () => void }) {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const [f, setF] = useState(agente ? { nome: agente.nome, area: agente.area as keyof typeof AREAS, systemPrompt: agente.systemPrompt, provedor: agente.provedor as keyof typeof PROVEDORES, modelo: agente.modelo, ativo: agente.ativo } : vazio);
  const salvar = trpc.agentes.salvar.useMutation({ onSuccess: () => { utils.agentes.listar.invalidate(); avisar("Agente salvo."); aoFechar(); } });
  const campos = salvar.error?.data?.zod?.fieldErrors as Record<string, string[]> | undefined;
  return (
    <Modal titulo={agente ? `Editar ${agente.nome}` : "Novo agente"} aberto aoFechar={aoFechar} largura="max-w-2xl">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); salvar.mutate({ ...f, ...(agente ? { id: agente.id, versao: agente.versao } : {}) }); }}>
        <div className="grid gap-3 md:grid-cols-2">
          <Campo rotulo="Nome *" required maxLength={80} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} erro={campos?.nome?.[0]} />
          <Selecao rotulo="Área" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value as keyof typeof AREAS })}>
            {Object.entries(AREAS).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </Selecao>
          <Selecao rotulo="LLM" value={f.provedor} onChange={(e) => { const p = e.target.value as keyof typeof PROVEDORES; setF({ ...f, provedor: p, modelo: MODELOS_SUGERIDOS[p][0] ?? "" }); }}>
            {Object.entries(PROVEDORES).map(([v, r]) => <option key={v} value={v}>{r}</option>)}
          </Selecao>
          <div>
            <Campo rotulo="Modelo (ID) *" required list="modelos" value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} erro={campos?.modelo?.[0]} placeholder="ID conforme a documentação do provedor" />
            <datalist id="modelos">{MODELOS_SUGERIDOS[f.provedor].map((m) => <option key={m} value={m} />)}</datalist>
          </div>
        </div>
        <AreaTexto rotulo="System Prompt" rows={10} maxLength={20000} value={f.systemPrompt} onChange={(e) => setF({ ...f, systemPrompt: e.target.value })} placeholder="Papel, regras obrigatórias, o que nunca prometer, quando pedir aprovação ou chamar um humano…" />
        <p className="text-xs text-slate-500">{f.systemPrompt.length.toLocaleString("pt-BR")} / 20.000 caracteres. Toda alteração fica registrada na auditoria, com o texto anterior.</p>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Ativo</label>
        <Erro erro={salvar.error} />
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={salvar.isPending}>Salvar</Botao></div>
      </form>
    </Modal>
  );
}

function Logs({ agente, aoFechar }: { agente: Agente; aoFechar: () => void }) {
  const q = trpc.agentes.execucoes.useQuery({ agenteId: agente.id });
  return (
    <Modal titulo={`Execuções: ${agente.nome}`} aberto aoFechar={aoFechar} largura="max-w-3xl">
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio texto="Nenhuma execução registrada. Elas aparecem aqui quando o agente começar a operar." /> : (
        <Tabela colunas={["Quando", "Situação", "Resumo", "Tokens (entrada/saída)", "Duração"]}>
          {q.data.map((x) => (
            <tr key={x.id} className="align-top">
              <td className="whitespace-nowrap px-3 py-2">{dataHora(x.criadoEm)}</td>
              <td className="px-3 py-2"><Etiqueta valor={x.situacao === "ok" ? "ativo" : x.situacao === "erro" ? "recusada" : "pendente"} texto={x.situacao} /></td>
              <td className="px-3 py-2">{x.resumo}{x.erro && <div className="mt-1 font-mono text-xs text-red-700">{x.erro}</div>}</td>
              <td className="px-3 py-2">{x.tokensEntrada.toLocaleString("pt-BR")} / {x.tokensSaida.toLocaleString("pt-BR")}</td>
              <td className="px-3 py-2">{x.duracaoMs ? `${(x.duracaoMs / 1000).toFixed(1).replace(".", ",")} s` : "—"}</td>
            </tr>
          ))}
        </Tabela>
      )}
    </Modal>
  );
}

export default function Agentes() {
  const q = trpc.agentes.listar.useQuery();
  const [editando, setEditando] = useState<Agente | "novo" | null>(null);
  const [logsDe, setLogsDe] = useState<Agente | null>(null);
  return (
    <Pagina titulo="Agentes IA" acoes={<Botao onClick={() => setEditando("novo")}><Plus className="h-4 w-4" /> Agente</Botao>}>
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        A execução dos agentes ainda não está ligada: aqui você já define a função, o prompt e o modelo de cada um. Eles passam a operar quando a chave do provedor for configurada no servidor.
      </p>
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !q.data?.length ? (
        <Vazio texto="Nenhum agente cadastrado. Comece pelos quatro: Marketing, Comercial, Customer Success e Financeiro." acao={<Botao onClick={() => setEditando("novo")}>Cadastrar agente</Botao>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((a) => (
            <Cartao key={a.id} titulo={<span className="flex items-center gap-2"><Bot className="h-4 w-4 text-indigo-600" />{a.nome}</span>}
              acoes={<Etiqueta valor={a.ativo ? "ativo" : "cancelado"} texto={a.ativo ? "ativo" : "inativo"} />}>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-slate-500">Área</dt><dd>{AREAS[a.area as keyof typeof AREAS] ?? a.area}</dd>
                <dt className="text-slate-500">LLM</dt><dd>{PROVEDORES[a.provedor as keyof typeof PROVEDORES] ?? a.provedor}</dd>
                <dt className="text-slate-500">Modelo</dt><dd className="font-mono text-xs">{a.modelo}</dd>
              </dl>
              <p className="mt-3 line-clamp-3 whitespace-pre-line rounded bg-slate-50 p-2 text-xs text-slate-600">{a.systemPrompt || "Sem system prompt."}</p>
              <div className="mt-3 flex gap-2">
                <Botao variante="secundario" onClick={() => setEditando(a)}>Editar prompt e modelo</Botao>
                <Botao variante="fantasma" onClick={() => setLogsDe(a)}><History className="h-4 w-4" /> Logs</Botao>
              </div>
            </Cartao>
          ))}
        </div>
      )}
      {editando && <FormAgente agente={editando === "novo" ? null : editando} aoFechar={() => setEditando(null)} />}
      {logsDe && <Logs agente={logsDe} aoFechar={() => setLogsDe(null)} />}
    </Pagina>
  );
}
