import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { trpc } from "./lib/trpc";
import { SessaoCtx, type Eu } from "./lib/sessao";
import { definirFuso } from "./lib/formato";
import { Carregando } from "./components/ui";
import Login from "./pages/Login";
import Painel from "./pages/Painel";
import Pipeline from "./pages/Pipeline";
import Empresas from "./pages/Empresas";
import EmpresaDetalhe from "./pages/EmpresaDetalhe";
import Contatos from "./pages/Contatos";
import OportunidadeDetalhe from "./pages/OportunidadeDetalhe";
import Tarefas from "./pages/Tarefas";
import Contratos from "./pages/Contratos";
import Admin from "./pages/Admin";
import Financeiro from "./pages/Financeiro";

type ItemMenu = { para: string; rotulo: string; permissao?: Eu["permissoes"][number] };
const MENU: ItemMenu[] = [
  { para: "/", rotulo: "Painel" },
  { para: "/pipeline", rotulo: "Pipeline" },
  { para: "/empresas", rotulo: "Empresas" },
  { para: "/contatos", rotulo: "Contatos" },
  { para: "/tarefas", rotulo: "Tarefas" },
  { para: "/contratos", rotulo: "Contratos" },
  { para: "/financeiro", rotulo: "Financeiro", permissao: "financeiro:ler" },
  { para: "/admin", rotulo: "Administração", permissao: "auditoria:ver" },
];

function Layout({ eu }: { eu: Eu }) {
  const utils = trpc.useUtils();
  const sair = trpc.auth.logout.useMutation({ onSuccess: () => utils.invalidate() });
  const [menuAberto, setMenuAberto] = useState(false);
  const itens = MENU.filter((m) => !m.permissao || eu.permissoes.includes(m.permissao));
  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className={`${menuAberto ? "block" : "hidden"} border-b border-slate-200 bg-white md:block md:min-h-screen md:w-56 md:border-b-0 md:border-r`}>
        <div className="hidden px-4 py-4 text-base font-semibold text-indigo-700 md:block">Recepção IA</div>
        <nav className="flex flex-col gap-0.5 px-2 pb-3">
          {itens.map((m) => (
            <NavLink key={m.para} to={m.para} end={m.para === "/"} onClick={() => setMenuAberto(false)}
              className={({ isActive }) => `rounded-md px-3 py-2 text-sm ${isActive ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}>
              {m.rotulo}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
          <button className="text-sm font-semibold text-indigo-700 md:hidden" onClick={() => setMenuAberto((v) => !v)}>☰ Recepção IA</button>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <span>{eu.nome} · <span className="text-slate-400">{eu.perfil}</span></span>
            <button onClick={() => sair.mutate()} className="text-slate-500 underline hover:text-slate-700">Sair</button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-6">
          <Routes>
            <Route path="/" element={<Painel />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/empresas" element={<Empresas />} />
            <Route path="/empresas/:id" element={<EmpresaDetalhe />} />
            <Route path="/contatos" element={<Contatos />} />
            <Route path="/oportunidades/:id" element={<OportunidadeDetalhe />} />
            <Route path="/tarefas" element={<Tarefas />} />
            <Route path="/contratos" element={<Contratos />} />
            {eu.permissoes.includes("financeiro:ler") && <Route path="/financeiro/*" element={<Financeiro />} />}
            {eu.permissoes.includes("auditoria:ver") && <Route path="/admin/*" element={<Admin />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const eu = trpc.auth.eu.useQuery(undefined, { staleTime: 60_000 });
  useEffect(() => { if (eu.data?.fuso) definirFuso(eu.data.fuso); }, [eu.data?.fuso]);
  if (eu.isLoading) return <Carregando />;
  if (!eu.data) return <Login />;
  return (
    <SessaoCtx.Provider value={eu.data}>
      <Layout eu={eu.data} />
    </SessaoCtx.Provider>
  );
}
