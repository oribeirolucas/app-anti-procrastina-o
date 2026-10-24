import { createContext, useContext } from "react";
import type { Saidas } from "./trpc";

export type Eu = NonNullable<Saidas["auth"]["eu"]>;
export const SessaoCtx = createContext<Eu | null>(null);

export function useEu(): Eu {
  const eu = useContext(SessaoCtx);
  if (!eu) throw new Error("useEu fora da sessão");
  return eu;
}

export function usePode(permissao: Eu["permissoes"][number]): boolean {
  return useEu().permissoes.includes(permissao);
}
