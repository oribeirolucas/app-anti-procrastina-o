import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index.js";

async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations aplicadas com sucesso.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
