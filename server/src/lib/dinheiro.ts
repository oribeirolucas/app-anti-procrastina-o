// Dinheiro trafega como string "1234.56" (numeric do Postgres) e é somado em centavos.
// Nunca usar float para somar valores monetários.

export function paraCentavos(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  const s = String(valor).trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Valor monetário inválido: ${s}`);
  const negativo = s.startsWith("-");
  const [inteiro, frac = ""] = s.replace("-", "").split(".");
  const c = Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
  return negativo ? -c : c;
}

export function deCentavos(c: number): string {
  const negativo = c < 0;
  const abs = Math.abs(c);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negativo ? `-${s}` : s;
}

export function somar(valores: Array<string | number | null | undefined>): string {
  return deCentavos(valores.reduce<number>((acc, v) => acc + paraCentavos(v), 0));
}

// Aceita "1.234,56", "1234,56", "1234.56" (entrada de formulário/CSV brasileiro).
export function normalizarValorBR(entrada: string): string {
  let s = entrada.replace(/[R$\s]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return deCentavos(paraCentavos(s));
}
