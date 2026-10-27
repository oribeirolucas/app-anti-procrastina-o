import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../lib/env.js";
import * as schema from "./schema.js";

// Em funções serverless cada instância deve abrir poucas conexões (PG_POOL_MAX=1 com o pooler do Supabase).
export const pool = new Pool({ connectionString: env.databaseUrl, max: Number(process.env.PG_POOL_MAX) || 10 });

export const db = drizzle(pool, { schema });
export type Db = typeof db;
