import { useState } from "react";
import { trpc } from "../lib/trpc";
import { dataHora } from "../lib/formato";
import { useAvisar } from "../lib/aviso";
import { usePode } from "../lib/sessao";
import { AreaTexto, Botao, Campo, Carregando, Erro, Etiqueta, Modal, Pagina, Tabela, Vazio } from "../components/ui";

const ROTULO: Record<string, string> = { rascunho: "rascunho", aguardando_aprovacao: "aguardando seu Go", aprovada: "aprovada", enviando: "enviando", concluida: "concluída", recusada: "recusada", cancelada: "cancelada" };

export default function Reativacao() {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const gerir = usePode("automacoes:gerir");
  const q = trpc.pro.campanhas.useQuery(undefined, { refetchInterval: 30_000 });
  const [nova, setNova] = useState(false);
  const [f, setF] = useState({ nome: "", csv: "" });
  const criar = trpc.pro.criarCampanha.useMutation({ onSuccess: (c) => { utils.pro.campanhas.invalidate(); avisar(`Campanha criada com ${c.destinatarios} pacientes${c.erros.length ? ` (${c.erros.length} linhas ignoradas)` : ""}.`); setNova(false); setF({ nome: "", csv: "" }); } });
  const solicitar = trpc.pro.solicitarEnvio.useMutation({ onSuccess: () => { utils.pro.campanhas.invalidate(); avisar("Enviada para Aprovações. O disparo começa depois do Go."); } });
  const cancelar = trpc.pro.cancelarCampanha.useMutation({ onSuccess: () => { utils.pro.campanhas.invalidate(); avisar("Campanha cancelada."); } });
  return (
    <Pagina titulo="Reativação de pacientes" acoes={gerir && <Botao onClick={() => setNova(true)}>+ Campanha</Botao>}>
      <p className="text-sm text-slate-500">Mensagem com o modelo aprovado na Meta para pacientes que não voltam há tempo (plano Pro). Disparo em massa só depois do Go do estrategista em Aprovações; quem pediu para não receber mensagens é pulado automaticamente.</p>
      <Erro erro={q.error ?? solicitar.error ?? cancelar.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio texto="Nenhuma campanha ainda." /> : (
        <Tabela colunas={["Campanha", "Situação", "Pacientes", "Enviados", "Responderam", "Falhas/pulados", ""]}>
          {q.data.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2">{c.nome}<div className="text-xs text-slate-400">{c.modelo} · {dataHora(c.criadoEm)}</div></td>
              <td className="px-3 py-2"><Etiqueta valor={c.situacao} texto={ROTULO[c.situacao]} /></td>
              <td className="px-3 py-2">{c.total}</td>
              <td className="px-3 py-2">{c.enviados}</td>
              <td className="px-3 py-2">{c.responderam}{c.enviados ? <span className="text-xs text-slate-500"> ({Math.round((c.responderam / c.enviados) * 100)}%)</span> : null}</td>
              <td className="px-3 py-2">{c.falhas} / {c.pulados}</td>
              <td className="space-x-2 whitespace-nowrap px-3 py-2 text-xs">
                {gerir && c.situacao === "rascunho" && <button className="underline" disabled={solicitar.isPending} onClick={() => solicitar.mutate({ id: c.id, versao: c.versao })}>pedir aprovação</button>}
                {gerir && ["rascunho", "aguardando_aprovacao", "aprovada", "enviando"].includes(c.situacao) && <button className="underline" disabled={cancelar.isPending} onClick={() => confirm(`Cancelar a campanha ${c.nome}?`) && cancelar.mutate({ id: c.id })}>cancelar</button>}
              </td>
            </tr>
          ))}
        </Tabela>
      )}
      <Modal titulo="Nova campanha de reativação" aberto={nova} aoFechar={() => setNova(false)} largura="max-w-2xl">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); criar.mutate(f); }}>
          <Campo rotulo="Nome *" required minLength={3} maxLength={120} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Pacientes sem visita há 6 meses" />
          <label className="block text-sm"><span className="text-slate-700">Lista (CSV: nome; telefone)</span>
            <input type="file" accept=".csv,text/csv" className="mt-1 block text-sm" onChange={async (e) => { const a = e.target.files?.[0]; if (a) setF({ ...f, csv: await a.text() }); }} />
          </label>
          <AreaTexto rotulo="Ou cole aqui" rows={6} value={f.csv} onChange={(e) => setF({ ...f, csv: e.target.value })} placeholder={"Ana Souza;11988887777\nBruno Lima;21977776666"} />
          <Erro erro={criar.error} />
          <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={() => setNova(false)}>Cancelar</Botao><Botao carregando={criar.isPending}>Criar (rascunho)</Botao></div>
        </form>
      </Modal>
    </Pagina>
  );
}
