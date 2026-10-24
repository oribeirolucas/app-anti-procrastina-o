import { useState } from "react";
import { Link } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { moeda } from "../lib/formato";
import { somarBRL } from "../lib/somar";
import { Botao, Campo, Carregando, Erro, Modal, Pagina, Selecao } from "../components/ui";
import { FormOportunidade } from "../components/formularios";

export default function Pipeline() {
  const utils = trpc.useUtils();
  const [busca, setBusca] = useState("");
  const [responsavelId, setResponsavelId] = useState("");
  const [nova, setNova] = useState(false);
  const [perda, setPerda] = useState<{ id: string; etapaId: string } | null>(null);
  const [motivo, setMotivo] = useState("");
  const etapas = trpc.pipeline.etapas.useQuery();
  const responsaveis = trpc.admin.responsaveis.useQuery();
  const ops = trpc.pipeline.oportunidades.useQuery({ busca: busca || undefined, responsavelId: responsavelId || undefined });
  const mover = trpc.pipeline.moverEtapa.useMutation({
    onSuccess: () => { utils.pipeline.oportunidades.invalidate(); utils.relatorios.invalidate(); setPerda(null); setMotivo(""); },
  });

  const soltar = (opId: string, etapaId: string) => {
    const etapa = etapas.data?.find((e) => e.id === etapaId);
    if (etapa?.tipo === "perdida") setPerda({ id: opId, etapaId });
    else mover.mutate({ id: opId, etapaId });
  };

  return (
    <Pagina titulo="Pipeline" acoes={<Botao onClick={() => setNova(true)}>+ Oportunidade</Botao>}>
      <div className="flex flex-wrap gap-2">
        <div className="w-64"><Campo rotulo="Buscar" placeholder="Título ou empresa" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div className="w-56"><Selecao rotulo="Responsável" value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)}>
          <option value="">Todos</option>{responsaveis.data?.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </Selecao></div>
      </div>
      <Erro erro={ops.error ?? etapas.error ?? mover.error} />
      {ops.isLoading || etapas.isLoading ? <Carregando /> : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {etapas.data?.map((etapa) => {
            const cards = ops.data?.filter((o) => o.etapaId === etapa.id) ?? [];
            return (
              <div key={etapa.id} className="w-64 shrink-0 rounded-lg bg-slate-100 p-2"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => soltar(e.dataTransfer.getData("text/plain"), etapa.id)}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className="text-sm font-semibold text-slate-700">{etapa.nome}</span>
                  <span className="text-xs text-slate-500">{cards.length} · {moeda(somarBRL(cards.map((c) => c.valor)))}</span>
                </div>
                <div className="space-y-2">
                  {cards.map((o) => (
                    <div key={o.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", o.id)} className="cursor-grab rounded-md border border-slate-200 bg-white p-2 shadow-sm">
                      <Link to={`/oportunidades/${o.id}`} className="block text-sm font-medium text-slate-800 hover:text-indigo-700">{o.titulo}</Link>
                      <div className="text-xs text-slate-500">{o.empresa ?? "sem empresa"}</div>
                      <div className="mt-1 flex justify-between text-xs"><span className="font-medium text-slate-700">{moeda(o.valor)}/mês</span><span className="text-slate-400">{o.responsavel}</span></div>
                      {/* Alternativa ao arrastar (teclado/celular) */}
                      <select aria-label="Mover para etapa" className="mt-1 w-full rounded border border-slate-200 text-xs text-slate-500" value={etapa.id} onChange={(e) => soltar(o.id, e.target.value)}>
                        {etapas.data?.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <FormOportunidade aberto={nova} aoFechar={() => setNova(false)} />
      <Modal titulo="Motivo da perda" aberto={!!perda} aoFechar={() => setPerda(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (perda) mover.mutate({ ...perda, motivoPerda: motivo }); }}>
          <Campo rotulo="Por que a oportunidade foi perdida?" required value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Preço, timing, concorrente…" />
          <div className="flex justify-end"><Botao variante="perigo" carregando={mover.isPending}>Marcar como perdida</Botao></div>
        </form>
      </Modal>
    </Pagina>
  );
}
