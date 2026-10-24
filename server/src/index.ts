import { criarServidor } from "./app.js";
import { env } from "./lib/env.js";

const servidor = criarServidor();
servidor.listen(env.port, () => console.log(`Servidor em http://localhost:${env.port}`));

const encerrar = () => servidor.close(() => process.exit(0));
process.on("SIGTERM", encerrar);
process.on("SIGINT", encerrar);
