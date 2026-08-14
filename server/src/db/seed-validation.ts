import "dotenv/config";
import { db, pool } from "./index.js";
import { veiculoTecnico } from "./schema.js";

// Insere alguns veículos reais (hatch/sedan popular) para validar que o schema
// aceita corretamente os campos condicionais como NULL quando não aplicáveis
// à categoria (ex.: capacidade_carga_kg, tracao_4x4, autonomia_km).
const veiculosExemplo = [
  {
    marca: "Hyundai",
    modelo: "HB20",
    versao: "Comfort 1.0",
    ano: 2024,
    categoria: "hatch_sedan_popular" as const,
    precoReferencia: "75990",
    cambio: "manual",
    combustivel: "flex",
    scoreEconomia: 78,
    scoreSeguranca: 65,
    scoreEspaco: 60,
    scoreManutencao: 82,
    scoreRevenda: 85,
    // condicionais de picape/elétrico ficam NULL (omitidos)
  },
  {
    marca: "Chevrolet",
    modelo: "Onix",
    versao: "LT 1.0 Turbo",
    ano: 2024,
    categoria: "hatch_sedan_popular" as const,
    precoReferencia: "82990",
    cambio: "automatico",
    combustivel: "flex",
    scoreEconomia: 80,
    scoreSeguranca: 70,
    scoreEspaco: 62,
    scoreManutencao: 80,
    scoreRevenda: 88,
  },
  {
    marca: "Hyundai",
    modelo: "HB20",
    versao: "Platinum 1.0 Turbo",
    ano: 2024,
    categoria: "hatch_sedan_popular" as const,
    precoReferencia: "98990",
    cambio: "automatico",
    combustivel: "flex",
    scoreEconomia: 74,
    scoreSeguranca: 72,
    scoreEspaco: 61,
    scoreManutencao: 80,
    scoreRevenda: 85,
  },
  {
    marca: "Volkswagen",
    modelo: "Nivus",
    versao: "Comfortline 1.0 TSI",
    ano: 2024,
    categoria: "suv_compacto" as const,
    precoReferencia: "115990",
    cambio: "automatico",
    combustivel: "flex",
    scoreEconomia: 70,
    scoreSeguranca: 80,
    scoreEspaco: 75,
    scoreManutencao: 72,
    scoreRevenda: 78,
  },
  {
    marca: "Toyota",
    modelo: "Corolla Cross",
    versao: "XRE 2.0",
    ano: 2024,
    categoria: "suv_compacto" as const,
    precoReferencia: "162990",
    cambio: "automatico",
    combustivel: "flex",
    scoreEconomia: 65,
    scoreSeguranca: 90,
    scoreEspaco: 82,
    scoreManutencao: 75,
    scoreRevenda: 92,
  },
];

async function main() {
  console.log(`Inserindo ${veiculosExemplo.length} veículos de exemplo...`);
  const inseridos = await db
    .insert(veiculoTecnico)
    .values(veiculosExemplo)
    .returning();

  console.log(`OK: ${inseridos.length} registros inseridos.`);
  for (const v of inseridos) {
    console.log(
      `- ${v.marca} ${v.modelo} ${v.versao} [${v.categoria}] ` +
        `capacidadeCargaKg=${v.capacidadeCargaKg} autonomiaKm=${v.autonomiaKm}`,
    );
  }

  console.log(
    "\nValidação: campos condicionais (capacidadeCargaKg, tracao4x4, " +
      "alturaLivreSoloMm, autonomiaKm, tempoRecargaMin) devem estar NULL " +
      "acima, já que nenhum dos veículos é picape ou elétrico/híbrido.",
  );

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
