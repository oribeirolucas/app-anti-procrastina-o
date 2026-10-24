import { useState } from "react";
import { trpc } from "../lib/trpc";
import { hojeISO } from "../lib/formato";
import { Botao, Campo, Erro, Modal, Selecao } from "./ui";

type Contrato = { id: string; plano: string; valorMensal: string; valorSetup: string; inicio: string; fim: string | null; diaVencimento: number; situacao: string; oportunidadeId: string | null };

export function FormContrato({ aberto, aoFechar, empresaId, contrato, oportunidades }: { aberto: boolean; aoFechar: () => void; empresaId: string; contrato?: Contrato | null; oportunidades: { id: string; titulo: string }[] }) {
  const utils = trpc.useUtils();
  const inicial = () => ({
    plano: contrato?.plano ?? "Pro", valorMensal: contrato?.valorMensal.replace(".", ",") ?? "597,00", valorSetup: contrato?.valorSetup.replace(".", ",") ?? "0",
    inicio: contrato?.inicio ?? hojeISO(), fim: contrato?.fim ?? "", diaVencimento: String(contrato?.diaVencimento ?? 10), situacao: contrato?.situacao ?? "ativo", oportunidadeId: contrato?.oportunidadeId ?? "",
  });
  const [f, setF] = useState(inicial);
  const salvar = trpc.pipeline.salvarContrato.useMutation({ onSuccess: () => { utils.cadastros.empresa.invalidate(); utils.pipeline.contratos.invalidate(); utils.relatorios.invalidate(); aoFechar(); } });
  const set = (k: keyof ReturnType<typeof inicial>) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal titulo={contrato ? "Editar contrato" : "Novo contrato"} aberto={aberto} aoFechar={aoFechar}>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        salvar.mutate({ id: contrato?.id, empresaId, plano: f.plano, valorMensal: f.valorMensal, valorSetup: f.valorSetup || "0", inicio: f.inicio, fim: f.fim || null, diaVencimento: Number(f.diaVencimento), situacao: f.situacao as "ativo", oportunidadeId: f.oportunidadeId || null });
      }}>
        <div className="grid grid-cols-2 gap-3">
          <Selecao rotulo="Plano" value={f.plano} onChange={set("plano")}>{["Essencial", "Pro", "Rede", "Personalizado"].map((p) => <option key={p}>{p}</option>)}</Selecao>
          <Selecao rotulo="Situação" value={f.situacao} onChange={set("situacao")}><option value="ativo">Ativo</option><option value="suspenso">Suspenso</option><option value="cancelado">Cancelado</option></Selecao>
          <Campo rotulo="Mensalidade (R$)" required inputMode="decimal" value={f.valorMensal} onChange={set("valorMensal")} />
          <Campo rotulo="Setup (R$)" inputMode="decimal" value={f.valorSetup} onChange={set("valorSetup")} />
          <Campo rotulo="Início" type="date" required value={f.inicio} onChange={set("inicio")} />
          <Campo rotulo="Vencimento/renovação" type="date" value={f.fim} onChange={set("fim")} />
          <Campo rotulo="Dia de cobrança" type="number" min={1} max={28} value={f.diaVencimento} onChange={set("diaVencimento")} />
          <Selecao rotulo="Oportunidade de origem" value={f.oportunidadeId} onChange={set("oportunidadeId")}>
            <option value="">—</option>{oportunidades.map((o) => <option key={o.id} value={o.id}>{o.titulo}</option>)}
          </Selecao>
        </div>
        <Erro erro={salvar.error} />
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={salvar.isPending}>Salvar</Botao></div>
      </form>
    </Modal>
  );
}
