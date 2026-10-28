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
import Automacoes from "./pages/Automacoes";
import { Sino } from "./components/Sino";
import Aprovacoes from "./pages/Aprovacoes";
import Agentes from "./pages/Agentes";
import Inbox from "./pages/Inbox";
import Marketing from "./pages/Marketing";
import Sucesso from "./pages/Sucesso";
import {
  Bot, Building2, FileSignature, HeartPulse, KanbanSquare, LayoutDashboard, ListChecks, Megaphone, MessagesSquare, Settings, ShieldCheck, Users, Wallet, Workflow,
  type LucideIcon,
} from "lucide-react";

type ItemMenu = { para: string; rotulo: string; icone: LucideIcon; permissao?: Eu["permissoes"][number]; grupo?: string };
const MENU: ItemMenu[] = [
  { para: "/", rotulo: "Painel", icone: LayoutDashboard },
  { para: "/aprovacoes", rotulo: "Aprovações", icone: ShieldCheck, permissao: "aprovacoes:ver" },
  { para: "/pipeline", rotulo: "Pipeline", icone: KanbanSquare, grupo: "Comercial" },
  { para: "/empresas", rotulo: "Empresas", icone: Building2 },
  { para: "/contatos", rotulo: "Contatos", icone: Users },
  { para: "/tarefas", rotulo: "Tarefas", icone: ListChecks },
  { para: "/contratos", rotulo: "Contratos", icone: FileSignature },
  { para: "/marketing", rotulo: "Marketing", icone: Megaphone, permissao: "marketing:ver" },
  { para: "/sucesso", rotulo: "Customer Success", icone: HeartPulse },
  { para: "/inbox", rotulo: "Inbox WhatsApp", icone: MessagesSquare, permissao: "agente:atender", grupo: "Operação por IA" },
  { para: "/agentes", rotulo: "Agentes IA", icone: Bot, permissao: "agente:gerir" },
  { para: "/automacoes", rotulo: "Automações", icone: Workflow, permissao: "automacoes:ler" },
  { para: "/financeiro", rotulo: "Financeiro", icone: Wallet, permissao: "financeiro:ler", grupo: "Gestão" },
  { para: "/admin", rotulo: "Administração", icone: Settings, permissao: "auditoria:ver" },
];

function Layout({ eu }: { eu: Eu }) {
  const utils = trpc.useUtils();
  const sair = trpc.auth.logout.useMutation({ onSuccess: () => utils.invalidate() });
  const [menuAberto, setMenuAberto] = useState(false);
  const nome = trpc.auth.marca.useQuery().data?.nomeEmpresa ?? "";
  useEffect(() => { if (nome) document.title = nome; }, [nome]);
  const itens = MENU.filter((m) => !m.permissao || eu.permissoes.includes(m.permissao));
  return (
    <div className="min-h-screen bg-slate-50 md:flex">
      <aside className={`${menuAberto ? "block" : "hidden"} border-b border-slate-200 bg-white md:block md:min-h-screen md:w-56 md:border-b-0 md:border-r`}>
        <div className="hidden px-4 py-4 text-base font-semibold text-indigo-700 md:block">{nome}</div>
        <nav className="flex flex-col gap-0.5 px-2 pb-3">
          {itens.map((m) => (
            <div key={m.para}>
              {m.grupo && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{m.grupo}</div>}
              <NavLink to={m.para} end={m.para === "/"} onClick={() => setMenuAberto(false)}
                className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${isActive ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`}>
                <m.icone className="h-4 w-4 shrink-0" aria-hidden />
                {m.rotulo}
              </NavLink>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
          <button className="text-sm font-semibold text-indigo-700 md:hidden" onClick={() => setMenuAberto((v) => !v)}>☰ {nome || "Menu"}</button>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <Sino />
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
            <Route path="/sucesso" element={<Sucesso />} />
            {eu.permissoes.includes("aprovacoes:ver") && <Route path="/aprovacoes" element={<Aprovacoes />} />}
            {eu.permissoes.includes("agente:gerir") && <Route path="/agentes" element={<Agentes />} />}
            {eu.permissoes.includes("agente:atender") && <Route path="/inbox" element={<Inbox />} />}
            {eu.permissoes.includes("marketing:ver") && <Route path="/marketing" element={<Marketing />} />}
            {eu.permissoes.includes("automacoes:ler") && <Route path="/automacoes/*" element={<Automacoes />} />}
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
