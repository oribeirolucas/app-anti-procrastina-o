import { adminRouter } from "./admin.js";
import { authRouter } from "./auth.js";
import { cadastrosRouter } from "./crm/cadastros.js";
import { pipelineRouter } from "./crm/pipeline.js";
import { relatoriosRouter } from "./crm/relatorios.js";
import { contratosRouter } from "./crm/contratos.js";
import { financeiroRouter } from "./financeiro.js";
import { automacoesRouter } from "./automacoes.js";
import { planosRouter } from "./planos.js";
import { aprovacoesRouter } from "./operacao/aprovacoes.js";
import { agentesRouter } from "./operacao/agentes.js";
import { inboxRouter } from "./operacao/inbox.js";
import { marketingRouter } from "./operacao/marketing.js";
import { sucessoRouter } from "./operacao/sucesso.js";
import { proRouter } from "./operacao/pro.js";
import { router } from "./trpc.js";

export const appRouter = router({
  auth: authRouter,
  admin: adminRouter,
  cadastros: cadastrosRouter,
  pipeline: pipelineRouter,
  relatorios: relatoriosRouter,
  contratos: contratosRouter,
  financeiro: financeiroRouter,
  automacoes: automacoesRouter,
  planos: planosRouter,
  aprovacoes: aprovacoesRouter,
  agentes: agentesRouter,
  inbox: inboxRouter,
  marketing: marketingRouter,
  sucesso: sucessoRouter,
  pro: proRouter,
});

export type AppRouter = typeof appRouter;
