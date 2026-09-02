export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export const qs = <T extends HTMLElement>(sel: string): T => {
  const node = document.querySelector<T>(sel);
  if (!node) throw new Error(`Elemento não encontrado: ${sel}`);
  return node;
};

export const fmtDistance = (m: number): string =>
  m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${Math.floor(m)}m`;

export const fmtScore = (n: number): string => Math.floor(n).toLocaleString('pt-BR');
