import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

type Variante = "primario" | "secundario" | "perigo" | "fantasma";
const estilos: Record<Variante, string> = {
  primario: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
  secundario: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:opacity-50",
  perigo: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
  fantasma: "text-slate-600 hover:bg-slate-100 disabled:opacity-50",
};

export function Botao({ variante = "primario", className = "", carregando, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean }) {
  return (
    <button {...p} disabled={p.disabled || carregando} className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${estilos[variante]} ${className}`}>
      {carregando && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

const campoBase = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function Campo({ rotulo, erro, ...p }: InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{rotulo}</span>
      <input {...p} className={`${campoBase} ${erro ? "border-red-500" : ""}`} />
      {erro && <span className="mt-1 block text-xs text-red-600">{erro}</span>}
    </label>
  );
}

export function AreaTexto({ rotulo, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{rotulo}</span>
      <textarea {...p} className={campoBase} rows={p.rows ?? 3} />
    </label>
  );
}

export function Selecao({ rotulo, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { rotulo?: string }) {
  const sel = <select {...p} className={campoBase}>{children}</select>;
  if (!rotulo) return sel;
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-700">{rotulo}</span>
      {sel}
    </label>
  );
}

export function Modal({ titulo, aberto, aoFechar, children, largura = "max-w-lg" }: { titulo: string; aberto: boolean; aoFechar: () => void; children: ReactNode; largura?: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    // Foco no primeiro campo e fechamento com Esc
    caixa.current?.querySelector<HTMLElement>("input, select, textarea, button:not([aria-label=Fechar])")?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto, aoFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div ref={caixa} className={`w-full ${largura} rounded-lg bg-white shadow-xl`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold text-slate-800">{titulo}</h2>
          <button onClick={aoFechar} className="text-xl leading-none text-slate-400 hover:text-slate-600" aria-label="Fechar">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" /> {texto}
    </div>
  );
}

export function Erro({ erro, tentar }: { erro: { message: string } | null | undefined; tentar?: () => void }) {
  if (!erro) return null;
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      {erro.message}
      {tentar && <button onClick={tentar} className="ml-3 underline">Tentar novamente</button>}
    </div>
  );
}

export function Vazio({ texto, acao }: { texto: string; acao?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
      <p>{texto}</p>
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  );
}

export function Cartao({ titulo, children, acoes, className = "" }: { titulo?: ReactNode; children: ReactNode; acoes?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white ${className}`}>
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-700">{titulo}</h3>
          {acoes}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-800">{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-slate-500">{detalhe}</div>}
    </div>
  );
}

const cores: Record<string, string> = {
  aberta: "bg-sky-100 text-sky-700", ganha: "bg-emerald-100 text-emerald-700", perdida: "bg-slate-200 text-slate-600",
  ativo: "bg-emerald-100 text-emerald-700", suspenso: "bg-amber-100 text-amber-700", cancelado: "bg-slate-200 text-slate-600",
  admin: "bg-purple-100 text-purple-700", gestor: "bg-indigo-100 text-indigo-700", operador: "bg-slate-100 text-slate-700",
  pendente: "bg-amber-100 text-amber-700", aprovada: "bg-emerald-100 text-emerald-700", recusada: "bg-red-100 text-red-700",
  alto: "bg-red-100 text-red-700", medio: "bg-amber-100 text-amber-700", baixo: "bg-emerald-100 text-emerald-700",
  ia: "bg-violet-100 text-violet-700", humano: "bg-sky-100 text-sky-700", encerrada: "bg-slate-200 text-slate-600",
  agendado: "bg-sky-100 text-sky-700", confirmado: "bg-emerald-100 text-emerald-700", remarcar: "bg-amber-100 text-amber-700",
  sem_resposta: "bg-slate-200 text-slate-600", compareceu: "bg-emerald-100 text-emerald-700", faltou: "bg-red-100 text-red-700",
  rascunho: "bg-slate-100 text-slate-700", aguardando_aprovacao: "bg-amber-100 text-amber-700", enviando: "bg-violet-100 text-violet-700",
  concluida: "bg-emerald-100 text-emerald-700",
};
export function Etiqueta({ valor, texto }: { valor: string; texto?: string }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cores[valor] ?? "bg-slate-100 text-slate-700"}`}>{texto ?? valor}</span>;
}

export function Tabela({ colunas, children }: { colunas: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
          <tr>{colunas.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Pagina({ titulo, acoes, children }: { titulo: string; acoes?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">{titulo}</h1>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
      {children}
    </div>
  );
}
