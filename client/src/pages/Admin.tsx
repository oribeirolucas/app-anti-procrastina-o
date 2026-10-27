import { useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { trpc } from "../lib/trpc";
import { dataHora } from "../lib/formato";
import { usePode } from "../lib/sessao";
import { Botao, Campo, Carregando, Cartao, Erro, Etiqueta, Modal, Pagina, Selecao, Tabela } from "../components/ui";

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
  return (
    <Cartao titulo="Configurações gerais">
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

export default function Admin() {
  const gerirUsuarios = usePode("usuarios:gerir");
  const abas = [
    ...(gerirUsuarios ? [{ para: "/admin/usuarios", rotulo: "Usuários e permissões" }, { para: "/admin/configuracoes", rotulo: "Configurações" }] : []),
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
        <Route path="etapas" element={<Etapas />} />
        <Route path="auditoria" element={<Auditoria />} />
        <Route path="*" element={<Navigate to={abas[0].para} replace />} />
      </Routes>
    </Pagina>
  );
}
