import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/src/router/index.ts";

export const trpc = createTRPCReact<AppRouter>();
export type Entradas = inferRouterInputs<AppRouter>;
export type Saidas = inferRouterOutputs<AppRouter>;
