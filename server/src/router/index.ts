import { adminRouter } from "./admin.js";
import { authRouter } from "./auth.js";
import { cadastrosRouter } from "./crm/cadastros.js";
import { pipelineRouter } from "./crm/pipeline.js";
import { relatoriosRouter } from "./crm/relatorios.js";
import { financeiroRouter } from "./financeiro.js";
import { automacoesRouter } from "./automacoes.js";
import { router } from "./trpc.js";

export const appRouter = router({
  auth: authRouter,
  admin: adminRouter,
  cadastros: cadastrosRouter,
  pipeline: pipelineRouter,
  relatorios: relatoriosRouter,
  financeiro: financeiroRouter,
  automacoes: automacoesRouter,
});

export type AppRouter = typeof appRouter;
