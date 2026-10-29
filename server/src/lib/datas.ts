import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { configuracao } from "../db/schema.js";
import { env } from "./env.js";

export async function obterFuso(): Promise<string> {
  const [c] = await db.select().from(configuracao).where(eq(configuracao.chave, "fuso_horario"));
  return typeof c?.valor === "string" ? c.valor : env.fusoHorario;
}

// Diferença (ms) entre o horário local do fuso e UTC num dado instante.
function deslocamento(instante: number, fuso: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: fuso, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(instante))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - instante;
}

/** Instante UTC correspondente a 00:00 do dia `dataISO` (AAAA-MM-DD) no fuso informado. */
export function inicioDoDia(dataISO: string, fuso: string): Date {
  const [a, m, d] = dataISO.split("-").map(Number);
  const utc = Date.UTC(a, m - 1, d);
  return new Date(utc - deslocamento(utc, fuso));
}

export function intervaloDoPeriodo(de: string, ate: string, fuso: string) {
  const [a, m, d] = ate.split("-").map(Number);
  const proximo = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
  return { inicio: inicioDoDia(de, fuso), fimExclusivo: inicioDoDia(proximo, fuso) };
}

/** Data de hoje (AAAA-MM-DD) no fuso. */
export function hojeNoFuso(fuso: string, agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(agora);
}
