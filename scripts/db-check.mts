import { Client } from "pg";
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const client = new Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  const rows = await client.query(
    'SELECT "migration_name", "checksum", "finished_at" FROM _prisma_migrations ORDER BY "started_at"',
  );
  for (const row of rows.rows) {
    const file = `prisma/migrations/${row.migration_name}/migration.sql`;
    let fileHash = "MISSING";
    try {
      fileHash = createHash("sha256").update(readFileSync(file)).digest("hex");
    } catch {}
    console.log(
      `${row.migration_name}: applied=${row.checksum.slice(0, 12)} file=${fileHash.slice(0, 12)} match=${row.checksum === fileHash} finished=${row.finished_at}`,
    );
  }
} catch (error) {
  console.error("DB ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

