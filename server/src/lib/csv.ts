// Parser/gerador CSV (RFC 4180) com detecção de separador ; ou , (Excel BR usa ;).

export function parseCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primeiraLinha = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primeiraLinha.match(/;/g)?.length ?? 0) > (primeiraLinha.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && t[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((v) => v.trim() !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((v) => v.trim() !== "")) linhas.push(linha);
  return linhas;
}

const escapar = (v: unknown) => {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Neutraliza injeção de fórmula em planilhas (=, +, -, @)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function gerarCsv(cabecalho: string[], linhas: unknown[][]): string {
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(escapar).join(";")).join("\r\n");
}
