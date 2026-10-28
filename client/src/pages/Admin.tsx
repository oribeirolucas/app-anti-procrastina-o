import { useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { dataHora, moeda } from "../lib/formato";
import { useAvisar } from "../lib/aviso";
import { usePode } from "../lib/sessao";
import { Botao, Campo, Carregando, Cartao, Erro, Etiqueta, Modal, Pagina, Selecao, Tabela, Vazio } from "../components/ui";

type Perfil = "admin" | "gestor" | "operador";

function Usuarios() {
  const utils = trpc.useUtils();
  const q = trpc.admin.usuarios.useQuery();
  const matriz = trpc.admin.matrizPermissoes.useQuery();
  const [novo, setNovo] = useState(false);
  const [senhaDe, setSenhaDe] = useState<string | null>(null);
  const [f, setF] = useState({ nome: "", email: "", perfil: "operador" as Perfil, senha: "" });
  const [senha, setSenha] = useState("");
  const criar = trpc.admin.criarUsuario.useMutation({ onSuccess: () => { utils.admin.usuarios.invalidate(); setNovo(false); setF({ nome: "", email: "", perfil: "operador", senha: "" }); } });
  const atualizar = trpc.admin.atualizarUsuario.useMutation({ onSuccess: () => utils.admin.usuarios.invalidate() });
  const redefinir = trpc.admin.redefinirSenha.useMutation({ onSuccess: () => { setSenhaDe(null); setSenha(""); } });
  return (
    <div className="space-y-4">
      <Cartao titulo="Usuários" acoes={<Botao onClick={() => setNovo(true)}>+ Usuário</Botao>}>
        <Erro erro={q.error ?? atualizar.error} />
        {q.isLoading ? <Carregando /> : (
          <Tabela colunas={["Nome", "E-mail", "Perfil", "Situação", ""]}>
            {q.data?.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2">{u.nome}</td><td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">
                  <select className="rounded border border-slate-200 text-sm" value={u.perfil} onChange={(e) => atualizar.mutate({ id: u.id, perfil: e.target.value as Perfil })} aria-label="Perfil">
                    <option value="admin">admin</option><option value="gestor">gestor</option><option value="operador">operador</option>
                  </select>
                </td>
                <td className="px-3 py-2"><Etiqueta valor={u.ativo ? "ativo" : "cancelado"} texto={u.ativo ? "ativo" : "inativo"} /></td>
                <td className="space-x-3 px-3 py-2 text-xs">
                  <button className="underline" onClick={() => atualizar.mutate({ id: u.id, ativo: !u.ativo })}>{u.ativo ? "Desativar" : "Reativar"}</button>
                  <button className="underline" onClick={() => setSenhaDe(u.id)}>Redefinir senha</button>
                </td>
              </tr>
            ))}
          </Tabela>
        )}
      </Cartao>
      {matriz.data && (
        <Cartao titulo="Permissões por perfil (aplicadas no servidor)">
          <Tabela colunas={["Permissão", "admin", "gestor", "operador"]}>
            {Object.entries(matriz.data).map(([p, perfis]) => (
              <tr key={p}><td className="px-3 py-1 font-mono text-xs">{p}</td>{(["admin", "gestor", "operador"] as const).map((x) => <td key={x} className="px-3 py-1">{(perfis as readonly string[]).includes(x) ? "✓" : ""}</td>)}</tr>
            ))}
          </Tabela>
        </Cartao>
      )}
      <Modal titulo="Novo usuário" aberto={novo} aoFechar={() => setNovo(false)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); criar.mutate(f); }}>
          <Campo rotulo="Nome" required value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <Campo rotulo="E-mail" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Selecao rotulo="Perfil" value={f.perfil} onChange={(e) => setF({ ...f, perfil: e.target.value as Perfil })}><option value="operador">Operador</option><option value="gestor">Gestor</option><option value="admin">Administrador</option></Selecao>
          <Campo rotulo="Senha inicial (mín. 10, letras e números)" type="password" required value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} />
          <Erro erro={criar.error} />
          <div className="flex justify-end"><Botao carregando={criar.isPending}>Criar</Botao></div>
        </form>
      </Modal>
      <Modal titulo="Redefinir senha" aberto={!!senhaDe} aoFechar={() => setSenhaDe(null)}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (senhaDe) redefinir.mutate({ id: senhaDe, senha }); }}>
          <Campo rotulo="Nova senha" type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          <p className="text-xs text-slate-500">As sessões abertas desse usuário serão encerradas.</p>
          <Erro erro={redefinir.error} />
          <div className="flex justify-end"><Botao carregando={redefinir.isPending}>Salvar</Botao></div>
        </form>
      </Modal>
    </div>
  );
}

function Etapas() {
  const utils = trpc.useUtils();
  const q = trpc.pipeline.etapas.useQuery();
  const salvar = trpc.pipeline.salvarEtapa.useMutation({ onSuccess: () => utils.pipeline.etapas.invalidate() });
  const [nova, setNova] = useState({ nome: "", ordem: "", tipo: "aberta" as "aberta" | "ganha" | "perdida", probabilidade: "30" });
  return (
    <Cartao titulo="Etapas do pipeline">
      <Erro erro={salvar.error} />
      {q.isLoading ? <Carregando /> : (
        <Tabela colunas={["Ordem", "Nome", "Tipo", "Probabilidade", ""]}>
          {q.data?.map((e) => (
            <tr key={e.id}>
              <td className="px-3 py-2">{e.ordem}</td><td className="px-3 py-2">{e.nome}</td><td className="px-3 py-2"><Etiqueta valor={e.tipo} /></td><td className="px-3 py-2">{e.probabilidade}%</td>
              <td className="px-3 py-2 text-xs"><button className="underline" onClick={() => confirm(`Desativar a etapa ${e.nome}?`) && salvar.mutate({ ...e, tipo: e.tipo as "aberta", ativa: false })}>desativar</button></td>
            </tr>
          ))}
        </Tabela>
      )}
      <form className="mt-4 grid grid-cols-2 items-end gap-2 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); salvar.mutate({ nome: nova.nome, ordem: Number(nova.ordem), tipo: nova.tipo, probabilidade: Number(nova.probabilidade), ativa: true }); setNova({ ...nova, nome: "", ordem: "" }); }}>
        <Campo rotulo="Nome" required value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
        <Campo rotulo="Ordem" type="number" required value={nova.ordem} onChange={(e) => setNova({ ...nova, ordem: e.target.value })} />
        <Selecao rotulo="Tipo" value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as "aberta" })}><option value="aberta">aberta</option><option value="ganha">ganha</option><option value="perdida">perdida</option></Selecao>
        <Campo rotulo="Prob. %" type="number" min={0} max={100} value={nova.probabilidade} onChange={(e) => setNova({ ...nova, probabilidade: e.target.value })} />
        <Botao carregando={salvar.isPending}>Adicionar etapa</Botao>
      </form>
    </Cartao>
  );
}

function Auditoria() {
  const q = trpc.admin.auditoria.useQuery({ limite: 200 });
  return (
    <Cartao titulo="Registro de ações administrativas">
      <Erro erro={q.error} />
      {q.isLoading ? <Carregando /> : (
        <Tabela colunas={["Quando", "Usuário", "Ação", "Entidade", "Detalhes"]}>
          {q.data?.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap px-3 py-1">{dataHora(a.criadoEm)}</td><td className="px-3 py-1">{a.usuario ?? "—"}</td><td className="px-3 py-1 font-mono text-xs">{a.acao}</td>
              <td className="px-3 py-1 text-xs">{a.entidade}</td><td className="max-w-xs truncate px-3 py-1 font-mono text-xs text-slate-500">{a.detalhes ? JSON.stringify(a.detalhes) : ""}</td>
            </tr>
          ))}
        </Tabela>
      )}
    </Cartao>
  );
}

function Configuracoes() {
  const utils = trpc.useUtils();
  const q = trpc.admin.configuracoes.useQuery();
  const salvar = trpc.admin.salvarConfiguracao.useMutation({ onSuccess: () => { utils.admin.configuracoes.invalidate(); utils.auth.eu.invalidate(); } });
  const atual = (q.data?.find((c) => c.chave === "fuso_horario")?.valor as string | undefined) ?? "America/Sao_Paulo";
  const [fuso, setFuso] = useState("");
  const nomeAtual = (q.data?.find((c) => c.chave === "nome_empresa")?.valor as string | undefined) ?? "";
  const [nome, setNome] = useState<string | null>(null);
  const salvarNome = trpc.admin.salvarConfiguracao.useMutation({ onSuccess: () => { utils.admin.configuracoes.invalidate(); utils.auth.marca.invalidate(); setNome(null); } });
  return (
    <Cartao titulo="Configurações gerais">
      <form className="mb-4 flex max-w-md items-end gap-2" onSubmit={(e) => { e.preventDefault(); salvarNome.mutate({ chave: "nome_empresa", valor: nome ?? nomeAtual }); }}>
        <div className="flex-1"><Campo rotulo="Nome da empresa (aparece no login e no menu)" required maxLength={120} value={nome ?? nomeAtual} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Minha Empresa Ltda." /></div>
        <Botao carregando={salvarNome.isPending}>Salvar</Botao>
      </form>
      <Erro erro={salvarNome.error} />
      {salvarNome.isSuccess && <p className="mb-2 text-xs text-emerald-700">Nome salvo.</p>}
      <form className="flex max-w-md items-end gap-2" onSubmit={(e) => { e.preventDefault(); salvar.mutate({ chave: "fuso_horario", valor: fuso || atual }); }}>
        <Selecao rotulo="Fuso horário" value={fuso || atual} onChange={(e) => setFuso(e.target.value)}>
          {["America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Recife", "America/Fortaleza", "America/Belem", "America/Rio_Branco", "America/Noronha"].map((z) => <option key={z}>{z}</option>)}
        </Selecao>
        <Botao carregando={salvar.isPending}>Salvar</Botao>
      </form>
      <Erro erro={salvar.error} />
      {salvar.isSuccess && <p className="mt-2 text-xs text-emerald-700">Salvo.</p>}
    </Cartao>
  );
}

type Plano = { id: string; versao: number; nome: string; valorMensal: string; valorSetup: string; descricao: string | null; ativo: boolean; ordem: number };
const vazioPlano = { nome: "", valorMensal: "", valorSetup: "0,00", descricao: "", ordem: "0", ativo: true };

function Planos() {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const q = trpc.planos.listar.useQuery({ incluirInativos: true });
  const [editando, setEditando] = useState<Plano | "novo" | null>(null);
  const [f, setF] = useState(vazioPlano);
  const fechar = () => { setEditando(null); setF(vazioPlano); };
  const ok = (msg: string) => () => { utils.planos.listar.invalidate(); avisar(msg); fechar(); };
  const criar = trpc.planos.criar.useMutation({ onSuccess: ok("Plano criado.") });
  const atualizar = trpc.planos.atualizar.useMutation({ onSuccess: ok("Plano atualizado.") });
  const alternar = trpc.planos.atualizar.useMutation({ onSuccess: () => utils.planos.listar.invalidate() });
  const abrir = (p: Plano) => { setEditando(p); setF({ nome: p.nome, valorMensal: p.valorMensal.replace(".", ","), valorSetup: p.valorSetup.replace(".", ","), descricao: p.descricao ?? "", ordem: String(p.ordem), ativo: p.ativo }); };
  const erro = criar.error ?? atualizar.error;
  const campos = erro?.data?.zod?.fieldErrors as Record<string, string[]> | undefined;
  return (
    <Cartao titulo="Planos e preços" acoes={<Botao onClick={() => setEditando("novo")}>+ Plano</Botao>}>
      <p className="mb-3 text-xs text-slate-500">Preço de tabela usado ao registrar um contrato. Mudar o preço aqui não altera contratos já firmados.</p>
      <Erro erro={q.error ?? alternar.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : !q.data?.length ? <Vazio texto="Nenhum plano cadastrado. Cadastre o que você vende para agilizar os contratos." /> : (
        <Tabela colunas={["Ordem", "Plano", "Mensalidade", "Setup", "Situação", ""]}>
          {q.data.map((p) => (
            <tr key={p.id} className={p.ativo ? "" : "text-slate-400"}>
              <td className="px-3 py-2">{p.ordem}</td>
              <td className="px-3 py-2">{p.nome}{p.descricao && <div className="text-xs text-slate-500">{p.descricao}</div>}</td>
              <td className="px-3 py-2">{moeda(p.valorMensal)}</td><td className="px-3 py-2">{moeda(p.valorSetup)}</td>
              <td className="px-3 py-2"><Etiqueta valor={p.ativo ? "ativo" : "inativo"} /></td>
              <td className="space-x-2 px-3 py-2 text-xs">
                <button className="underline" onClick={() => abrir(p)}>editar</button>
                <button className="underline" disabled={alternar.isPending} onClick={() => alternar.mutate({ ...p, descricao: p.descricao, ativo: !p.ativo })}>{p.ativo ? "desativar" : "reativar"}</button>
              </td>
            </tr>
          ))}
        </Tabela>
      )}
      <Modal titulo={editando === "novo" ? "Novo plano" : "Editar plano"} aberto={!!editando} aoFechar={fechar}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          const dados = { nome: f.nome, valorMensal: f.valorMensal, valorSetup: f.valorSetup || "0", descricao: f.descricao || null, ordem: Number(f.ordem) || 0, ativo: f.ativo };
          if (editando && editando !== "novo") atualizar.mutate({ id: editando.id, versao: editando.versao, ...dados });
          else criar.mutate(dados);
        }}>
          <Campo rotulo="Nome *" required maxLength={60} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} erro={campos?.nome?.[0]} placeholder="Ex.: Plano Profissional" />
          <div className="grid grid-cols-3 gap-3">
            <Campo rotulo="Mensalidade (R$) *" required inputMode="decimal" placeholder="499,00" value={f.valorMensal} onChange={(e) => setF({ ...f, valorMensal: e.target.value })} erro={campos?.valorMensal?.[0]} />
            <Campo rotulo="Setup (R$)" inputMode="decimal" placeholder="0,00" value={f.valorSetup} onChange={(e) => setF({ ...f, valorSetup: e.target.value })} erro={campos?.valorSetup?.[0]} />
            <Campo rotulo="Ordem" type="number" min={0} max={999} value={f.ordem} onChange={(e) => setF({ ...f, ordem: e.target.value })} />
          </div>
          <Campo rotulo="Descrição" maxLength={300} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="O que o plano inclui" />
          <Erro erro={erro} />
          <div className="flex justify-end gap-2"><Botao type="button" variante="secundario" onClick={fechar}>Cancelar</Botao><Botao carregando={criar.isPending || atualizar.isPending}>Salvar</Botao></div>
        </form>
      </Modal>
    </Cartao>
  );
}

type Limites = { ia_conversa: string; ia_tokens: string; whatsapp_conversa: string; transcricao_segundos: string; bloquearAoAtingir: boolean };
const numOuNulo = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\D/g, "")));

function UsoLimites() {
  const utils = trpc.useUtils();
  const avisar = useAvisar();
  const gerir = usePode("config:gerir");
  const q = trpc.admin.uso.useQuery();
  const [f, setF] = useState<Limites | null>(null);
  const salvar = trpc.admin.salvarLimites.useMutation({ onSuccess: () => { utils.admin.uso.invalidate(); setF(null); avisar("Franquia salva."); } });
  const atual: Limites | null = q.data
    ? {
        ...(Object.fromEntries(q.data.recursos.map((r) => [r.recurso, r.limite === null ? "" : String(r.limite)])) as Omit<Limites, "bloquearAoAtingir">),
        bloquearAoAtingir: q.data.bloquearAoAtingir,
      }
    : null;
  const v = f ?? atual;
  const [ano, mes] = (q.data?.mes ?? "").split("-");
  return (
    <Cartao titulo={`Uso do mês${q.data ? ` (${mes}/${ano})` : ""}`}>
      <Erro erro={q.error} tentar={() => q.refetch()} />
      {q.isLoading ? <Carregando /> : q.data && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {q.data.recursos.map((r) => {
            const pct = r.percentual === null ? null : Math.min(r.percentual, 1);
            const cor = r.percentual === null ? "bg-slate-300" : r.percentual >= 1 ? "bg-red-600" : r.percentual >= 0.8 ? "bg-amber-500" : "bg-emerald-600";
            return (
              <div key={r.recurso} className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm text-slate-500">{r.nome}</div>
                <div className="text-xl font-semibold text-slate-800">
                  {r.usado.toLocaleString("pt-BR")}
                  <span className="text-sm font-normal text-slate-500"> / {r.limite === null ? "sem limite" : r.limite.toLocaleString("pt-BR")}</span>
                </div>
                <div className="mt-2 h-2 rounded bg-slate-100" role="progressbar" aria-label={r.nome} aria-valuenow={Math.round((pct ?? 0) * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-2 rounded ${cor}`} style={{ width: `${(pct ?? 0) * 100}%` }} />
                </div>
                <div className="mt-1 text-xs text-slate-500">Custo estimado: {moeda(r.custoEstimado)}{r.percentual !== null && r.percentual >= 1 ? " · franquia esgotada" : ""}</div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">O consumo é registrado pelo agente de IA e pelo WhatsApp quando estiverem ativos. Os administradores recebem aviso no sininho ao atingir 80% e 100% da franquia.</p>
      {gerir && v && (
        <form className="mt-4 space-y-3 border-t border-slate-100 pt-4" onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate({ ia_conversa: numOuNulo(v.ia_conversa), ia_tokens: numOuNulo(v.ia_tokens), whatsapp_conversa: numOuNulo(v.whatsapp_conversa), transcricao_segundos: numOuNulo(v.transcricao_segundos), bloquearAoAtingir: v.bloquearAoAtingir });
        }}>
          <h4 className="text-sm font-semibold text-slate-700">Franquia mensal desta instalação</h4>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Conversas com IA" inputMode="numeric" placeholder="vazio = sem limite" value={v.ia_conversa} onChange={(e) => setF({ ...v, ia_conversa: e.target.value })} />
            <Campo rotulo="Tokens de IA" inputMode="numeric" placeholder="vazio = sem limite" value={v.ia_tokens} onChange={(e) => setF({ ...v, ia_tokens: e.target.value })} />
            <Campo rotulo="Conversas no WhatsApp" inputMode="numeric" placeholder="vazio = sem limite" value={v.whatsapp_conversa} onChange={(e) => setF({ ...v, whatsapp_conversa: e.target.value })} />
            <Campo rotulo="Áudio transcrito (segundos)" inputMode="numeric" placeholder="vazio = sem limite" value={v.transcricao_segundos} onChange={(e) => setF({ ...v, transcricao_segundos: e.target.value })} />
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-1" checked={v.bloquearAoAtingir} onChange={(e) => setF({ ...v, bloquearAoAtingir: e.target.checked })} />
            <span>Bloquear ao esgotar a franquia<span className="block text-xs text-slate-500">Desmarcado: o uso continua e o excedente pode ser cobrado. Marcado: a IA para de responder e encaminha para atendimento humano.</span></span>
          </label>
          <Erro erro={salvar.error} />
          <Botao carregando={salvar.isPending}>Salvar franquia</Botao>
        </form>
      )}
    </Cartao>
  );
}

export default function Admin() {
  const gerirUsuarios = usePode("usuarios:gerir");
  const abas = [
    ...(gerirUsuarios ? [{ para: "/admin/usuarios", rotulo: "Usuários e permissões" }, { para: "/admin/configuracoes", rotulo: "Configurações" }, { para: "/admin/planos", rotulo: "Planos e preços" }] : []),
    { para: "/admin/uso", rotulo: "Uso e limites" },
    { para: "/admin/etapas", rotulo: "Pipeline" },
    { para: "/admin/auditoria", rotulo: "Auditoria" },
  ];
  return (
    <Pagina titulo="Administração">
      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {abas.map((a) => <NavLink key={a.para} to={a.para} className={({ isActive }) => `px-3 py-2 text-sm ${isActive ? "border-b-2 border-indigo-600 font-medium text-indigo-700" : "text-slate-600"}`}>{a.rotulo}</NavLink>)}
      </nav>
      <Routes>
        {gerirUsuarios && <Route path="usuarios" element={<Usuarios />} />}
        {gerirUsuarios && <Route path="configuracoes" element={<Configuracoes />} />}
        {gerirUsuarios && <Route path="planos" element={<Planos />} />}
        <Route path="uso" element={<UsoLimites />} />
        <Route path="etapas" element={<Etapas />} />
        <Route path="auditoria" element={<Auditoria />} />
        <Route path="*" element={<Navigate to={abas[0].para} replace />} />
      </Routes>
    </Pagina>
  );
}
