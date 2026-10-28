import { criarServidor } from "./app.js";
import { env } from "./lib/env.js";

import { executarCiclo } from "./automacoes/motor.js";
import { log } from "./lib/log.js";
import { dispararAtendimento } from "./services/container.js";

const servidor = criarServidor();

// Processador de automações em segundo plano (VPS/Docker). Na Vercel não há processo contínuo:
// lá o ciclo roda após cada alteração e pelo botão "Processar agora".
const intervalo = env.intervaloWorkerS > 0
  ? setInterval(() => {
      executarCiclo().catch((e) => log("erro", "automacao.ciclo_intervalo", { erro: String(e) }));
      void dispararAtendimento(); // rede de segurança: mensagens que não foram respondidas na hora
    }, env.intervaloWorkerS * 1000)
  : null;
servidor.listen(env.port, () => console.log(`Servidor em http://localhost:${env.port}`));

const encerrar = () => { if (intervalo) clearInterval(intervalo); servidor.close(() => process.exit(0)); };
process.on("SIGTERM", encerrar);
process.on("SIGINT", encerrar);
