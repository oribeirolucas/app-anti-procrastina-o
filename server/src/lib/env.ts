import "dotenv/config";

function obrigatoria(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Variável de ambiente ${nome} não definida. Veja .env.example.`);
  return v;
}

export const env = {
  databaseUrl: obrigatoria("DATABASE_URL"),
  port: Number(process.env.PORT) || 3000,
  producao: process.env.NODE_ENV === "production",
  // Duração da sessão em horas
  sessaoHoras: Number(process.env.SESSAO_HORAS) || 12,
  fusoHorario: process.env.FUSO_HORARIO || "America/Sao_Paulo",
  // Origem permitida para requisições que mudam estado (proteção CSRF por Origin)
  origemApp: process.env.ORIGEM_APP || "http://localhost:5173",
};
