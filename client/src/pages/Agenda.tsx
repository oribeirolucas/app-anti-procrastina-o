import { useState } from "react";
import { trpc } from "../lib/trpc";
import { diaHora, hojeISO } from "../lib/formato";
import { useAvisar } from "../lib/aviso";
import { usePode } from "../lib/sessao";
import { AreaTexto, Botao, Campo, Carregando, Erro, Etiqueta, Modal, Pagina, Tabela, Vazio } from "../components/ui";
import { FiltroUnidade, useUnidades } from "../components/Unidades";

const ROTULO: Record<string, string> = { agendado: "agendado", confirmado: "confirmado", cancelado: "cancelado", remarcar: "remarcar", sem_resposta: "sem resposta", compareceu: "compareceu", faltou: "faltou" };

function Importar({ aoFechar, unidadePadrao }: { aoFechar: () => void; unidadePadrao: string }) {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const [csv, setCsv] = useState("");
  const [unidadeId, setUnidadeId] = useState(unidadePadrao);
  const previa = trpc.pro.importarAgenda.useMutation();
  const aplicar = trpc.pro.importarAgenda.useMutation({ onSuccess: (r) => { utils.pro.agenda.invalidate(); avisar(`${r.importadas} consultas importadas${r.repetidas ? `, ${r.repetidas} já existiam` : ""}.`); aoFechar(); } });
  return (
    <Modal titulo="Importar agenda" aberto aoFechar={aoFechar} largura="max-w-2xl">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Cole as linhas da planilha (exportada do sistema da clínica) nas colunas: <strong>nome; telefone; data (dd/mm/aaaa); hora (HH:MM); procedimento; profissional; unidade</strong>. Reimportar a mesma consulta não duplica.</p>
        <FiltroUnidade valor={unidadeId} aoMudar={(v) => { setUnidadeId(v); previa.reset(); }} rotulo="Unidade (quando a planilha não tiver a coluna)" todas="Número principal" />
        <label className="block text-sm"><span className="text-slate-700">Arquivo CSV</span>
          <input type="file" accept=".csv,text/csv" className="mt-1 block text-sm" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); previa.reset(); } }} />
        </label>
        <AreaTexto rotulo="Ou cole aqui" rows={6} value={csv} onChange={(e) => { setCsv(e.target.value); previa.reset(); }} placeholder={"Ana Souza;11988887777;20/11/2026;14:00;Limpeza de pele;Dra. Paula"} />
        {previa.data && (
          <div className="rounded border border-slate-200 p-3 text-sm">
            <p><strong>{previa.data.validas}</strong> linhas válidas{previa.data.erros.length ? <span className="text-red-700"> · {previa.data.erros.length} com erro</span> : ""}</p>
            {previa.data.erros.length > 0 && <ul className="mt-2 max-h-32 overflow-y-auto text-xs text-red-700">{previa.data.erros.map((e) => <li key={e.linha}>Linha {e.linha}: {e.erro}</li>)}</ul>}
          </div>
        )}
        <Erro erro={previa.error ?? aplicar.error} />
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="secundario" disabled={!csv.trim()} carregando={previa.isPending} onClick={() => previa.mutate({ csv, unidadeId: unidadeId || undefined })}>Pré-visualizar</Botao>
          <Botao disabled={!previa.data?.validas} carregando={aplicar.isPending} onClick={() => aplicar.mutate({ csv, aplicar: true, unidadeId: unidadeId || undefined })}>Importar {previa.data?.validas ?? ""}</Botao>
        </div>
      </div>
    </Modal>
  );
}

function Nova({ aoFechar, unidadePadrao }: { aoFechar: () => void; unidadePadrao: string }) {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const [f, setF] = useState({ nome: "", telefone: "", data: "", hora: "", procedimento: "", profissional: "", unidadeId: unidadePadrao });
  const criar = trpc.pro.criarAgendamento.useMutation({ onSuccess: () => { utils.pro.agenda.invalidate(); avisar("Consulta cadastrada."); aoFechar(); } });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal titulo="Nova consulta" aberto aoFechar={aoFechar}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); criar.mutate({ ...f, unidadeId: f.unidadeId || undefined }); }}>
        <FiltroUnidade valor={f.unidadeId} aoMudar={(v) => setF({ ...f, unidadeId: v })} todas="Número principal" />
        <Campo rotulo="Paciente *" required value={f.nome} onChange={set("nome")} />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="WhatsApp (DDD + número) *" required inputMode="tel" value={f.telefone} onChange={set("telefone")} />
          <Campo rotulo="Procedimento" value={f.procedimento} onChange={set("procedimento")} />
          <Campo rotulo="Data (dd/mm/aaaa) *" required placeholder="20/11/2026" value={f.data} onChange={set("data")} />
          <Campo rotulo="Hora (HH:MM) *" required placeholder="14:30" value={f.hora} onChange={set("hora")} />
        </div>
        <Campo rotulo="Profissional" value={f.profissional} onChange={set("profissional")} />
        <Erro erro={criar.error} />
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={criar.isPending}>Salvar</Botao></div>
      </form>
    </Modal>
  );
}

export default function Agenda() {
  const escrever = usePode("crm:escrever");
  const [de, setDe] = useState(hojeISO());
  const [ate, setAte] = useState(hojeISO(7));
  const [unidadeId, setUnidadeId] = useState("");
  const temUnidades = useUnidades().length > 0;
  const q = trpc.pro.agenda.useQuery({ de, ate, unidadeId: unidadeId || undefined }, { enabled: ate >= de, refetchInterval: 60_000 });
  const utils = trpc.useUtils();
  const alterar = trpc.pro.alterarAgendamento.useMutation({ onSuccess: () => utils.pro.agenda.invalidate() });
  const [modal, setModal] = useState<"importar" | "nova" | null>(null);
  const l = q.data ?? [];
  const conta = (s: string) => l.filter((x) => x.situacao === s).length;
  return (
    <Pagina titulo="Agenda" acoes={escrever && <div className="flex gap-2"><Botao variante="secundario" onClick={() => setModal("importar")}>Importar planilha</Botao><Botao onClick={() => setModal("nova")}>+ Consulta</Botao></div>}>
      <p className="text-sm text-slate-500">Consultas que recebem a confirmação automática no dia anterior (plano Pro). A resposta do paciente atualiza a situação sozinha; cancelamentos e pedidos de remarcação viram tarefa para a recepção.</p>
      <div className="flex flex-wrap items-end gap-3">
        <Campo rotulo="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        <FiltroUnidade valor={unidadeId} aoMudar={setUnidadeId} />
        {l.length > 0 && <p className="pb-2 text-sm text-slate-600">{l.length} consultas · {conta("confirmado")} confirmadas · {conta("cancelado") + conta("remarcar")} a reagendar · {conta("sem_resposta")} sem resposta</p>}
      </div>
      <Erro erro={q.error ?? alterar.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !l.length ? <Vazio texto="Nenhuma consulta no período. Importe a agenda da clínica ou cadastre uma consulta." /> : (
        <Tabela colunas={["Quando", "Paciente", "Procedimento", "Situação", "Lembrete", ""]}>
          {l.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap px-3 py-2">{diaHora(a.inicio)}</td>
              <td className="px-3 py-2">{a.nome}<div className="text-xs text-slate-400">{[temUnidades ? a.unidade ?? "número principal" : null, a.profissional].filter(Boolean).join(" · ")}</div></td>
              <td className="px-3 py-2">{a.procedimento ?? "—"}</td>
              <td className="px-3 py-2"><Etiqueta valor={a.situacao} texto={ROTULO[a.situacao]} />{a.observacao && <div className="text-xs text-slate-500">{a.observacao}</div>}</td>
              <td className="px-3 py-2 text-xs">{a.lembreteEnviadoEm ? (a.erroLembrete ? <span className="text-red-700" title={a.erroLembrete}>não enviado</span> : "enviado") : "—"}</td>
              <td className="space-x-2 whitespace-nowrap px-3 py-2 text-xs">
                {escrever && new Date(a.inicio) < new Date() && !["compareceu", "faltou", "cancelado"].includes(a.situacao) && (
                  <>
                    <button className="underline" disabled={alterar.isPending} onClick={() => alterar.mutate({ id: a.id, versao: a.versao, situacao: "compareceu" })}>compareceu</button>
                    <button className="underline" disabled={alterar.isPending} onClick={() => alterar.mutate({ id: a.id, versao: a.versao, situacao: "faltou" })}>faltou</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      )}
      {modal === "importar" && <Importar aoFechar={() => setModal(null)} unidadePadrao={unidadeId} />}
      {modal === "nova" && <Nova aoFechar={() => setModal(null)} unidadePadrao={unidadeId} />}
    </Pagina>
  );
}
