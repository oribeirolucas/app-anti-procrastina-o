import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryCache, MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { trpc } from "./lib/trpc";
import App from "./App";
import { ProvedorAvisos } from "./lib/aviso";
import "./index.css";

const naoAutenticado = (e: unknown) => e instanceof TRPCClientError && e.data?.code === "UNAUTHORIZED";

function Raiz() {
  const [qc] = useState(
    (): QueryClient =>
      new QueryClient({
        // Sessão expirada em qualquer chamada → reconsulta auth.eu, que leva à tela de login
        queryCache: new QueryCache({ onError: (e): void => { if (naoAutenticado(e)) void qc.invalidateQueries({ queryKey: [["auth", "eu"]] }); } }),
        mutationCache: new MutationCache({
          onError: (e): void => { if (naoAutenticado(e)) void qc.invalidateQueries({ queryKey: [["auth", "eu"]] }); },
          // Automações rodam no servidor logo após cada alteração e podem criar tarefas, avisos e follow-ups:
          // atualiza essas listas em qualquer tela para o efeito aparecer na hora.
          onSuccess: (): void => {
            for (const k of [["automacoes"], ["pipeline", "tarefas"], ["pipeline", "oportunidade"], ["cadastros", "empresa"]]) void qc.invalidateQueries({ queryKey: [k] });
          },
        }),
        defaultOptions: {
          queries: {
            retry: (n, e) => !(e instanceof TRPCClientError && ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND"].includes(e.data?.code)) && n < 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  const [cliente] = useState(() => trpc.createClient({ links: [httpBatchLink({ url: "/trpc", fetch: (u, o) => fetch(u, { ...o, credentials: "same-origin" }) })] }));
  return (
    <trpc.Provider client={cliente} queryClient={qc}>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <ProvedorAvisos>
            <App />
          </ProvedorAvisos>
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Raiz />
  </StrictMode>,
);
