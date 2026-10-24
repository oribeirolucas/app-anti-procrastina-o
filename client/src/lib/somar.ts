// Soma valores monetários em centavos (evita erro de ponto flutuante na exibição de totais).
export function somarBRL(valores: Array<string | null | undefined>): string {
  const c = valores.reduce((acc, v) => acc + Math.round(Number(v ?? 0) * 100), 0);
  return (c / 100).toFixed(2);
}
