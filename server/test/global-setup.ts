import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Recria o schema do banco de TESTE a cada execução.
export default async function () {
  const url = process.env.DATABASE_URL_TEST ?? "postgresql://app:app@localhost:5432/plataforma_test";
  if (!/_test\b/.test(url)) throw new Error("Por segurança, o banco de testes precisa ter _test no nome.");
  const pool = new Pool({ connectionString: url });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();
}
