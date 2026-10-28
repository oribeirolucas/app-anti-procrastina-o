import { TRPCError } from "@trpc/server";
import { like } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/db/index.js";
import { notificacao } from "../src/db/schema.js";
import { registrarConsumo, verificarLimite } from "../src/lib/consumo.js";
import { chamadorComo, prepararBase } from "./utils.js";

const codigo = async (p: Promise<unknown>) => {
  try { await p; return "OK"; } catch (e) { return (e as TRPCError).code; }
};

beforeAll(prepararBase);

describe("consumo e franquia", () => {
  it("só admin define limites; gestor vê o uso; operador não vê", async () => {
    const g = await chamadorComo("gestor");
    const op = await chamadorComo("operador");
    expect(await codigo(g.admin.salvarLimites({ ia_conversa: 10, ia_tokens: null, whatsapp_conversa: null, bloquearAoAtingir: true }))).toBe("FORBIDDEN");
    expect(await codigo(op.admin.uso())).toBe("FORBIDDEN");
    expect(await codigo(g.admin.uso())).toBe("OK");
    const a = await chamadorComo("admin");
    expect(await codigo(a.admin.salvarLimites({ ia_conversa: -1, ia_tokens: null, whatsapp_conversa: null, bloquearAoAtingir: true }))).toBe("BAD_REQUEST");
  });

  it("conta uma vez por referência, avisa em 80% e 100% e bloqueia quando configurado", async () => {
    const a = await chamadorComo("admin");
    await a.admin.salvarLimites({ ia_conversa: 5, ia_tokens: null, whatsapp_conversa: null, bloquearAoAtingir: true });

    for (let i = 1; i <= 3; i++) await registrarConsumo({ recurso: "ia_conversa", quantidade: 1, referencia: `conv-${i}`, custoEstimado: "0.40" });
    // Reprocessar a mesma conversa não conta de novo
    const repetido = await registrarConsumo({ recurso: "ia_conversa", quantidade: 1, referencia: "conv-3" });
    expect(repetido).toMatchObject({ registrado: false, usado: 3 });

    // Uma notificação por admin ativo; a chave identifica a faixa (80/100) do mês
    const avisos = () => db.selectDistinct({ chave: notificacao.chave }).from(notificacao).where(like(notificacao.chave, "uso:ia_conversa:%"));
    expect(await avisos()).toHaveLength(0);
    await registrarConsumo({ recurso: "ia_conversa", quantidade: 1, referencia: "conv-4" }); // 4/5 = 80%
    expect((await avisos()).map((n) => n.chave?.split(":").pop())).toEqual(["80"]);
    expect(await verificarLimite("ia_conversa")).toMatchObject({ permitido: true, usado: 4, limite: 5 });

    await registrarConsumo({ recurso: "ia_conversa", quantidade: 1, referencia: "conv-5" }); // 100%
    await registrarConsumo({ recurso: "ia_conversa", quantidade: 1, referencia: "conv-6" }); // acima: não duplica aviso
    expect((await avisos()).map((n) => n.chave?.split(":").pop()).sort()).toEqual(["100", "80"]);
    expect(await verificarLimite("ia_conversa")).toMatchObject({ permitido: false, excede: true, usado: 6 });

    const uso = await a.admin.uso();
    const ia = uso.recursos.find((r) => r.recurso === "ia_conversa")!;
    expect(ia).toMatchObject({ usado: 6, limite: 5, custoEstimado: "1.20" });

    // Sem bloqueio: excede mas segue permitido (cobra-se o excedente)
    await a.admin.salvarLimites({ ia_conversa: 5, ia_tokens: null, whatsapp_conversa: null, bloquearAoAtingir: false });
    expect(await verificarLimite("ia_conversa")).toMatchObject({ permitido: true, excede: true });
  });
});
