import { useState } from "react";
import { trpc, type Saidas } from "../lib/trpc";
import { baixarArquivo } from "../lib/formato";
import { usePode } from "../lib/sessao";
import { Botao, Erro, Modal } from "./ui";

export function BotoesCsv({ entidade }: { entidade: "empresas" | "contatos" }) {
  const utils = trpc.useUtils();
  const podeExportar = usePode("crm:exportar");
  const podeImportar = usePode("crm:importar");
  const [aberto, setAberto] = useState(false);
  const [conteudo, setConteudo] = useState("");
  const [resultado, setResultado] = useState<Saidas["relatorios"]["importar"] | null>(null);
  const exportar = trpc.relatorios.exportar.useMutation({ onSuccess: (r) => baixarArquivo(r.nomeArquivo, r.conteudo) });
  const importar = trpc.relatorios.importar.useMutation({
    onSuccess: (r) => { setResultado(r); if (!r.simulado) utils.cadastros.invalidate(); },
  });
  const modelo = entidade === "empresas" ? "nome;documento;segmento;cidade;uf;telefone;site" : "nome;email;telefone;cargo;empresa";
  const fechar = () => { setAberto(false); setConteudo(""); setResultado(null); importar.reset(); };
  return (
    <>
      {podeExportar && <Botao variante="secundario" carregando={exportar.isPending} onClick={() => exportar.mutate({ entidade })}>Exportar CSV</Botao>}
      {podeImportar && <Botao variante="secundario" onClick={() => setAberto(true)}>Importar CSV</Botao>}
      <Modal titulo={`Importar ${entidade}`} aberto={aberto} aoFechar={fechar} largura="max-w-2xl">
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">Colunas aceitas (separador <b>;</b> ou <b>,</b>): <code className="rounded bg-slate-100 px-1">{modelo}</code>. Primeiro validamos tudo; nada é gravado até você confirmar.</p>
          <input type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setConteudo(await f.text()); setResultado(null); } }} />
          <Erro erro={importar.error} />
          {resultado && (
            <div className={`rounded-md p-3 ${resultado.simulado ? "bg-slate-50" : "bg-emerald-50"}`}>
              <p className="font-medium">{resultado.simulado ? "Validação" : "Importação concluída"}: {resultado.validos} de {resultado.total} linhas {resultado.simulado ? "prontas para importar" : "importadas"}.</p>
              {resultado.erros.length > 0 && (
                <ul className="mt-2 max-h-48 overflow-y-auto text-xs text-red-700">{resultado.erros.map((e) => <li key={e.linha}>Linha {e.linha}: {e.erro}</li>)}</ul>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Botao variante="secundario" disabled={!conteudo} carregando={importar.isPending && importar.variables?.simular} onClick={() => importar.mutate({ entidade, conteudo, simular: true })}>Validar</Botao>
            <Botao disabled={!resultado?.simulado || resultado.validos === 0} carregando={importar.isPending && !importar.variables?.simular} onClick={() => importar.mutate({ entidade, conteudo, simular: false })}>Importar {resultado?.simulado ? resultado.validos : ""} linhas</Botao>
          </div>
        </div>
      </Modal>
    </>
  );
}
