// Fonte única das permissões. Documentado em docs/PERMISSOES.md.
export type Perfil = "admin" | "gestor" | "operador";

export const PERMISSOES = {
  "usuarios:gerir": ["admin"],
  "config:gerir": ["admin"],
  "auditoria:ver": ["admin", "gestor"],
  "crm:ler": ["admin", "gestor", "operador"],
  "crm:escrever": ["admin", "gestor", "operador"],
  "crm:arquivar": ["admin", "gestor"],
  "crm:reabrir": ["admin", "gestor"],
  "dados:anonimizar": ["admin"],
  "crm:pipeline": ["admin", "gestor"],
  "crm:exportar": ["admin", "gestor"],
  "crm:importar": ["admin", "gestor"],
  "contratos:escrever": ["admin", "gestor"],
  "financeiro:ler": ["admin", "gestor"],
  "financeiro:escrever": ["admin", "gestor"],
  "automacoes:ler": ["admin", "gestor"],
  "automacoes:gerir": ["admin", "gestor"],
  "agente:gerir": ["admin", "gestor"],
  "agente:atender": ["admin", "gestor", "operador"],
  // Governança: o estrategista (admin) decide; o gestor acompanha a fila
  "aprovacoes:ver": ["admin", "gestor"],
  "aprovacoes:decidir": ["admin"],
  "marketing:ver": ["admin", "gestor"],
} as const satisfies Record<string, readonly Perfil[]>;

export type Permissao = keyof typeof PERMISSOES;

export function pode(perfil: Perfil, permissao: Permissao): boolean {
  return (PERMISSOES[permissao] as readonly Perfil[]).includes(perfil);
}

export function permissoesDoPerfil(perfil: Perfil): Permissao[] {
  return (Object.keys(PERMISSOES) as Permissao[]).filter((p) => pode(perfil, p));
}
