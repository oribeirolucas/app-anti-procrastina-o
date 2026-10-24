import { useState, type FormEvent } from "react";
import { trpc } from "../lib/trpc";
import { AreaTexto, Botao, Campo, Erro, Modal, Selecao } from "./ui";

const erroCampo = (e: { data?: { zod?: { fieldErrors?: Record<string, string[] | undefined> } | null } | null } | null, campo: string) =>
  e?.data?.zod?.fieldErrors?.[campo]?.[0];

export function FormEmpresa({ aberto, aoFechar, aoSalvar }: { aberto: boolean; aoFechar: () => void; aoSalvar?: (id: string) => void }) {
  const utils = trpc.useUtils();
  const [f, setF] = useState({ nome: "", documento: "", segmento: "", cidade: "", uf: "", telefone: "", site: "" });
  const criar = trpc.cadastros.criarEmpresa.useMutation({
    onSuccess: (e) => { utils.cadastros.empresas.invalidate(); aoFechar(); setF({ nome: "", documento: "", segmento: "", cidade: "", uf: "", telefone: "", site: "" }); aoSalvar?.(e.id); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal titulo="Nova empresa" aberto={aberto} aoFechar={aoFechar}>
      <form className="space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); criar.mutate(f); }}>
        <Campo rotulo="Nome *" required value={f.nome} onChange={set("nome")} erro={erroCampo(criar.error, "nome")} />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="CNPJ" value={f.documento} onChange={set("documento")} />
          <Selecao rotulo="Segmento" value={f.segmento} onChange={set("segmento")}>
            <option value="">—</option>
            {["odontologia", "estetica", "fisioterapia", "psicologia", "medicina", "outro"].map((s) => <option key={s}>{s}</option>)}
          </Selecao>
          <Campo rotulo="Cidade" value={f.cidade} onChange={set("cidade")} />
          <Campo rotulo="UF" maxLength={2} value={f.uf} onChange={set("uf")} />
          <Campo rotulo="Telefone" value={f.telefone} onChange={set("telefone")} />
          <Campo rotulo="Site" value={f.site} onChange={set("site")} />
        </div>
        <Erro erro={criar.error} />
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={criar.isPending}>Salvar</Botao></div>
      </form>
    </Modal>
  );
}

export function FormContato({ aberto, aoFechar, empresaId }: { aberto: boolean; aoFechar: () => void; empresaId?: string }) {
  const utils = trpc.useUtils();
  const vazio = { nome: "", email: "", telefone: "", cargo: "" };
  const [f, setF] = useState(vazio);
  const criar = trpc.cadastros.criarContato.useMutation({
    onSuccess: () => { utils.cadastros.invalidate(); aoFechar(); setF(vazio); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal titulo="Novo contato" aberto={aberto} aoFechar={aoFechar}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); criar.mutate({ ...f, empresaId }); }}>
        <Campo rotulo="Nome *" required value={f.nome} onChange={set("nome")} erro={erroCampo(criar.error, "nome")} />
        <Campo rotulo="E-mail" type="email" value={f.email} onChange={set("email")} erro={erroCampo(criar.error, "email")} />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Telefone" value={f.telefone} onChange={set("telefone")} />
          <Campo rotulo="Cargo" value={f.cargo} onChange={set("cargo")} />
        </div>
        <Erro erro={criar.error} />
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={criar.isPending}>Salvar</Botao></div>
      </form>
    </Modal>
  );
}

export function FormOportunidade({ aberto, aoFechar, empresaId }: { aberto: boolean; aoFechar: () => void; empresaId?: string }) {
  const utils = trpc.useUtils();
  const etapas = trpc.pipeline.etapas.useQuery();
  const responsaveis = trpc.admin.responsaveis.useQuery();
  const empresas = trpc.cadastros.empresas.useQuery({}, { enabled: aberto && !empresaId });
  const vazio = { titulo: "", empresaId: empresaId ?? "", etapaId: "", responsavelId: "", origem: "ligacao", valor: "", previsaoFechamento: "" };
  const [f, setF] = useState(vazio);
  const contatos = trpc.cadastros.contatos.useQuery({ empresaId: f.empresaId || undefined }, { enabled: aberto && !!f.empresaId });
  const [contatoId, setContatoId] = useState("");
  const criar = trpc.pipeline.criarOportunidade.useMutation({
    onSuccess: () => { utils.pipeline.invalidate(); utils.cadastros.invalidate(); utils.relatorios.invalidate(); aoFechar(); setF(vazio); },
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal titulo="Nova oportunidade" aberto={aberto} aoFechar={aoFechar}>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault();
        criar.mutate({ titulo: f.titulo, empresaId: f.empresaId || null, contatoId: contatoId || null, etapaId: f.etapaId || undefined, responsavelId: f.responsavelId || null, origem: f.origem || null, valor: f.valor || "0", previsaoFechamento: f.previsaoFechamento || null });
      }}>
        <Campo rotulo="Título *" required value={f.titulo} onChange={set("titulo")} placeholder="Ex.: Plano Pro — Clínica X" />
        {!empresaId && (
          <Selecao rotulo="Empresa" value={f.empresaId} onChange={set("empresaId")}>
            <option value="">— sem empresa —</option>
            {empresas.data?.linhas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </Selecao>
        )}
        {f.empresaId && (
          <Selecao rotulo="Contato" value={contatoId} onChange={(e) => setContatoId(e.target.value)}>
            <option value="">—</option>
            {contatos.data?.linhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Selecao>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor mensal (R$)" inputMode="decimal" placeholder="597,00" value={f.valor} onChange={set("valor")} erro={erroCampo(criar.error, "valor")} />
          <Selecao rotulo="Origem" value={f.origem} onChange={set("origem")}>
            {["ligacao", "indicacao", "site", "chat_ia", "evento", "outro"].map((o) => <option key={o}>{o}</option>)}
          </Selecao>
          <Selecao rotulo="Etapa" value={f.etapaId} onChange={set("etapaId")}>
            <option value="">Primeira etapa</option>
            {etapas.data?.filter((e) => e.tipo === "aberta").map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </Selecao>
          <Selecao rotulo="Responsável" value={f.responsavelId} onChange={set("responsavelId")}>
            <option value="">Eu</option>
            {responsaveis.data?.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </Selecao>
          <Campo rotulo="Previsão de fechamento" type="date" value={f.previsaoFechamento} onChange={set("previsaoFechamento")} />
        </div>
        <Erro erro={criar.error} />
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={criar.isPending}>Salvar</Botao></div>
      </form>
    </Modal>
  );
}

export function FormTarefa({ aberto, aoFechar, vinculo }: { aberto: boolean; aoFechar: () => void; vinculo: { empresaId?: string | null; oportunidadeId?: string | null; contatoId?: string | null } }) {
  const utils = trpc.useUtils();
  const responsaveis = trpc.admin.responsaveis.useQuery(undefined, { enabled: aberto });
  const vazio = { titulo: "", descricao: "", venceEm: "", responsavelId: "" };
  const [f, setF] = useState(vazio);
  const criar = trpc.pipeline.criarTarefa.useMutation({ onSuccess: () => { utils.pipeline.invalidate(); utils.cadastros.empresa.invalidate(); aoFechar(); setF(vazio); } });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal titulo="Nova tarefa / lembrete" aberto={aberto} aoFechar={aoFechar}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); criar.mutate({ ...vinculo, titulo: f.titulo, descricao: f.descricao || null, venceEm: f.venceEm ? new Date(f.venceEm) : null, responsavelId: f.responsavelId || null }); }}>
        <Campo rotulo="Título *" required value={f.titulo} onChange={set("titulo")} placeholder="Ex.: Ligar para confirmar demonstração" />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Vence em" type="datetime-local" value={f.venceEm} onChange={set("venceEm")} />
          <Selecao rotulo="Responsável" value={f.responsavelId} onChange={set("responsavelId")}>
            <option value="">Eu</option>
            {responsaveis.data?.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </Selecao>
        </div>
        <AreaTexto rotulo="Descrição" value={f.descricao} onChange={set("descricao")} />
        <Erro erro={criar.error} />
        <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={aoFechar}>Cancelar</Botao><Botao carregando={criar.isPending}>Salvar</Botao></div>
      </form>
    </Modal>
  );
}

export function FormInteracao({ vinculo }: { vinculo: { empresaId?: string | null; oportunidadeId?: string | null; contatoId?: string | null } }) {
  const utils = trpc.useUtils();
  const [tipo, setTipo] = useState<"nota" | "ligacao" | "email" | "whatsapp" | "reuniao">("nota");
  const [descricao, setDescricao] = useState("");
  const [resposta, setResposta] = useState(false);
  const reg = trpc.pipeline.registrarInteracao.useMutation({ onSuccess: () => { utils.pipeline.oportunidade.invalidate(); utils.cadastros.empresa.invalidate(); setDescricao(""); setResposta(false); } });
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); reg.mutate({ ...vinculo, tipo, descricao, respostaDoContato: resposta }); }}>
      <div className="flex gap-2">
        <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label="Tipo de interação">
          <option value="nota">Nota</option><option value="ligacao">Ligação</option><option value="email">E-mail</option><option value="whatsapp">WhatsApp</option><option value="reuniao">Reunião</option>
        </Selecao>
      </div>
      <textarea className="w-full rounded-md border border-slate-300 p-2 text-sm" rows={2} placeholder="O que aconteceu?" value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={resposta} onChange={(e) => setResposta(e.target.checked)} /> O contato respondeu (interrompe follow-ups)</label>
        <Botao carregando={reg.isPending}>Registrar</Botao>
      </div>
      <Erro erro={reg.error} />
    </form>
  );
}
