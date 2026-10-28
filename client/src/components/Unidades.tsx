import { trpc } from "../lib/trpc";
import { Selecao } from "./ui";

/** Unidades cadastradas (plano Rede). Lista vazia = instalação de uma unidade só: os filtros nem aparecem. */
export function useUnidades() {
  return trpc.unidades.listar.useQuery(undefined, { staleTime: 60_000 }).data ?? [];
}

export function FiltroUnidade({ valor, aoMudar, rotulo = "Unidade", todas = "Todas" }: { valor: string; aoMudar: (v: string) => void; rotulo?: string; todas?: string }) {
  const unidades = useUnidades();
  if (!unidades.length) return null;
  return (
    <Selecao rotulo={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value)}>
      <option value="">{todas}</option>
      {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}{u.ativa ? "" : " (inativa)"}</option>)}
    </Selecao>
  );
}
