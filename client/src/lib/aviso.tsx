import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Aviso = { id: number; texto: string; tipo: "ok" | "erro" };
const Ctx = createContext<(texto: string, tipo?: Aviso["tipo"]) => void>(() => {});

export function ProvedorAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const avisar = useCallback((texto: string, tipo: Aviso["tipo"] = "ok") => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a, { id, texto, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={avisar}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`rounded-md px-4 py-2 text-sm text-white shadow-lg ${a.tipo === "ok" ? "bg-emerald-600" : "bg-red-600"}`}>{a.texto}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useAvisar = () => useContext(Ctx);
