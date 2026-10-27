let fuso = "America/Sao_Paulo";
export const definirFuso = (f: string) => { fuso = f; };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const moeda = (v: string | number | null | undefined) => brl.format(Number(v ?? 0));

export const data = (v: string | Date | null | undefined) => {
  if (!v) return "—";
  // Datas puras (AAAA-MM-DD) não sofrem conversão de fuso
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, dateStyle: "short" }).format(new Date(v));
};

export const dataHora = (v: string | Date | null | undefined) =>
  v ? new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—";

export const pct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);

/** Data de hoje no fuso configurado, AAAA-MM-DD */
export const hojeISO = (deslocDias = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date(Date.now() + deslocDias * 86400_000));

export const inicioDoMesISO = () => hojeISO().slice(0, 8) + "01";

export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

/** Último dia do mês "AAAA-MM" como AAAA-MM-DD (evita datas inválidas como 31/06). */
export const fimDoMesISO = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};
