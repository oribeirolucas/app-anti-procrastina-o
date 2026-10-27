import { useState } from "react";
import { trpc } from "../lib/trpc";
import { hojeISO } from "../lib/formato";
import { useAvisar } from "../lib/aviso";
import { AreaTexto, Botao, Campo, Erro, Modal, Selecao } from "./ui";

type Contrato = { id: string; versao: number; plano: string; valorMensal: string; valorSetup: string; inicio: string; fim: string | null; diaVencimento: number; oportunidadeId: string | null; observacoes: string | null; empresaId: string };
export type PreenchimentoContrato = { empresaId?: string | null; oportunidadeId?: string; valorMensal?: string; plano?: string };

const PLANOS = ["Essencial", "Pro", "Rede", "Personalizado"];
const somarAno = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;

/** Cria (com empresa fixa ou escolhida) ou edita um contrato. */
export function FormContrato({ aoFechar, empresaId, contrato, preencher }: { aoFechar: () => void; empresaId?: string; contrato?: Contrato | null; preencher?: PreenchimentoContrato }) {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const empresaFixa = contrato?.empresaId ?? empresaId ?? preencher?.empresaId ?? "";
  const [f, setF] = useState(() => {
    const inicio = contrato?.inicio ?? hojeISO();
    return {
      empresaId: empresaFixa,
      oportunidadeId: contrato?.oportunidadeId ?? preencher?.oportunidadeId ?? "",
      plano: contrato?.plano ?? preencher?.plano ?? "Pro",
      valorMensal: (contrato?.valorMensal ?? preencher?.valorMensal ?? "597.00").replace(".", ","),
      valorSetup: (contrato?.valorSetup ?? "0").replace(".", ","),
      inicio,
      fim: contrato ? (contrato.fim ?? "") : somarAno(inicio),
      diaVencimento: String(contrato?.diaVencimento ?? 10),
      observacoes: contrato?.observacoes ?? "",
    };
  });
  const empresas = trpc.cadastros.empresas.useQuery({}, { enabled: !empresaFixa });
  const oportunidades = trpc.pipeline.oportunidades.useQuery({ situacao: "ganha" }, { enabled: !!f.empresaId });
  const ok = (msg: string) => () => { utils.contratos.invalidate(); utils.cadastros.empresa.invalidate(); utils.relatorios.invalidate(); avisar(msg); aoFechar(); };
  const criar = trpc.contratos.criar.useMutation({ onSuccess: ok("Contrato registrado.") });
  const atualizar = trpc.contratos.atualizar.useMutation({ onSuccess: ok("Contrato atualizado.") });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const erro = criar.error ?? atualizar.error;
  const campos = erro?.data?.zod?.fieldErrors as Record<string, string[]> | undefined;

  return (
    <Modal titulo={contrato ? `Editar contrato ${contrato.plano}` : "Novo contrato"} aberto aoFechar={aoFechar} largura="max-w-xl">
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        const dados = { plano: f.plano, valorMensal: f.valorMensal, valorSetup: f.valorSetup || "0", inicio: f.inicio, fim: f.fim || null, diaVencimento: Number(f.diaVencimento), oportunidadeId: f.oportunidadeId || null, observacoes: f.observacoes || null };
        if (contrato) atualizar.mutate({ id: contrato.id, versao: contrato.versao, ...dados });
        else criar.mutate({ empresaId: f.empresaId, ...dados });
      }}>
        {!empresaFixa && (
          <Selecao rotulo="Empresa *" required value={f.empresaId} onChange={(e) => setF({ ...f, empresaId: e.target.value, oportunidadeId: "" })}>
            <option value="">Escolha…</option>
            {empresas.data?.linhas.map((e) => <option key={e.id} value={e.id}>{e.nome}{e.cidade ? ` (${e.cidade})` : ""}</option>)}
          </Selecao>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Selecao rotulo="Plano" value={PLANOS.includes(f.plano) ? f.plano : "Personalizado"} onChange={set("plano")}>{PLANOS.map((p) => <option key={p}>{p}</option>)}</Selecao>
          <Selecao rotulo="Venda de origem" value={f.oportunidadeId} onChange={set("oportunidadeId")}>
            <option value="">—</option>
            {oportunidades.data?.filter((o) => o.empresaId === f.empresaId || o.id === f.oportunidadeId).map((o) => <option key={o.id} value={o.id}>{o.titulo}</option>)}
          </Selecao>
          <Campo rotulo="Mensalidade (R$) *" required inputMode="decimal" placeholder="597,00" value={f.valorMensal} onChange={set("valorMensal")} erro={campos?.valorMensal?.[0]} />
          <Campo rotulo="Setup (R$)" inputMode="decimal" placeholder="0,00" value={f.valorSetup} onChange={set("valorSetup")} erro={campos?.valorSetup?.[0]} />
          <Campo rotulo="Início *" type="date" required value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value, fim: !contrato && f.fim === somarAno(f.inicio) ? somarAno(e.target.value) : f.fim })} />
          <Campo rotulo="Fim / renovação" type="date" value={f.fim} onChange={set("fim")} erro={campos?.fim?.[0]} />
          <Campo rotulo="Dia de cobrança (1–28) *" type="number" min={1} max={28} required value={f.diaVencimento} onChange={set("diaVencimento")} erro={campos?.diaVencimento?.[0]} />
        </div>
        <p className="text-xs text-slate-500">Deixe o fim em branco para contrato por tempo indeterminado. As mensalidades são geradas em Financeiro → Gerar cobranças do mês.</p>
        <AreaTexto rotulo="Observações" rows={2} value={f.observacoes} onChange={set("observacoes")} />
        <Erro erro={erro} />
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={criar.isPending || atualizar.isPending}>Salvar</Botao></div>
      </form>
    </Modal>
  );
}
