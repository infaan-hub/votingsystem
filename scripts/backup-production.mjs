import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

/**
 * Dumps the current Prisma tables to a restorable SQL file.
 *
 *   node scripts/backup-production.mjs
 *
 * Read-only: it never writes to the database. Run this before any migration.
 */

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: tables } = await client.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
   AND table_name <> '_prisma_migrations'
   ORDER BY table_name`,
);

const q = (id) => `"${id}"`;
const lit = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Buffer.isBuffer(v)) return `'\\x${v.toString("hex")}'::bytea`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const out = [
  "-- Production backup (Prisma tables)",
  `-- Generated ${new Date().toISOString()}`,
  "-- Restore with: psql \"$DATABASE_URL\" -f this-file.sql",
  "",
];

let total = 0;
for (const { table_name: t } of tables) {
  const { rows: cols } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [t],
  );
  const colList = cols.map((c) => q(c.column_name)).join(", ");
  const { rows } = await client.query(`SELECT * FROM ${q(t)}`);
  for (const r of rows) {
    out.push(
      `INSERT INTO ${q(t)} (${colList}) VALUES (${cols
        .map((c) => lit(r[c.column_name]))
        .join(", ")});`,
    );
  }
  out.push(`-- ${t}: ${rows.length} rows`, "");
  total += rows.length;
  console.log(`${t}: ${rows.length} rows`);
}

const dir = path.resolve("backups");
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = path.join(dir, `production-${stamp}.sql`);
fs.writeFileSync(file, out.join("\n"));

console.log(`\n${total} rows across ${tables.length} tables`);
console.log(`Backup: ${file} (${fs.statSync(file).size} bytes)`);
await client.end();