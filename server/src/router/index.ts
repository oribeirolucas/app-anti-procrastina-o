import { router } from "./trpc.js";

// Endpoints (diagnóstico, recomendação, lead, admin, etc.) serão adicionados
// em etapas futuras. Este roteador raiz existe só para validar a estrutura.
export const appRouter = router({});

export type AppRouter = typeof appRouter;
