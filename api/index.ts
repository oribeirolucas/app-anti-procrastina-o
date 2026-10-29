// Entrada para a Vercel (ambiente de teste). A API roda como função; o front-end é servido como estático.
// Em produção (VPS) usa-se server/src/index.ts, sem este arquivo.
import { tratarRequisicao } from "../server/src/app.js";

export default tratarRequisicao;
