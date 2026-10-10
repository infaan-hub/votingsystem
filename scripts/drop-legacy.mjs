import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DRY = process.argv.includes("--dry-run");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: tables } = await client.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
   ORDER BY table_name`,
);
const all = tables.map((r) => r.table_name);
const legacy = all.filter((t) => t !== "_prisma_migrations" && !/^[A-Z]/.test(t));
const kept = all.filter((t) => !legacy.includes(t));

console.log("Legacy tables:", legacy.join(", ") || "(none)");
console.log("Tables kept:  ", kept.join(", "));

if (DRY) {
  await client.end();
  console.log("\nDry run - nothing dumped or dropped.");
  process.exit(0);
}

const q = (id) => `"${id}"`;
const lit = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Buffer.isBuffer(v)) return `'\\\\x${v.toString("hex")}'::bytea`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const parts = [
  "-- Legacy Django tables dumped before removal",
  `-- Generated ${new Date().toISOString()}`,
  "-- Restore with: psql $DATABASE_URL -f this-file.sql",
  "",
];

for (const t of legacy) {
  const { rows: cols } = await client.query(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [t],
  );
  const { rows: fks } = await client.query(
    `SELECT tc.constraint_name, kcu.column_name,
            ccu.table_name AS ref_table, ccu.column_name AS ref_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     JOIN information_schema.constraint_column_usage ccu
       ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = $1
       AND tc.constraint_type = 'FOREIGN KEY'`,
    [t],
  );
  const { rows: uniques } = await client.query(
    `SELECT tc.constraint_name, string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS cols
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public' AND tc.table_name = $1
       AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
     GROUP BY tc.constraint_name, tc.constraint_type
     ORDER BY tc.constraint_type`,
    [t],
  );

  const colDefs = cols
    .map((c) => {
      let type = c.data_type === "USER-DEFINED" ? c.udt_name : c.data_type;
      if (type === "character varying") type = "varchar";
      if (type === "timestamp with time zone") type = "timestamptz";
      if (type === "timestamp without time zone") type = "timestamp";
      if (type === "USER-DEFINED") type = c.udt_name;
      return `${q(c.column_name)} ${type}`;
    })
    .join(", ");

  parts.push(`DROP TABLE IF EXISTS ${q(t)} CASCADE;`);
  parts.push(`CREATE TABLE ${q(t)} (${colDefs});`);

  for (const u of uniques) {
    const kind = u.constraint_type === "PRIMARY KEY" ? "PRIMARY KEY" : "UNIQUE";
    parts.push(`ALTER TABLE ${q(t)} ADD CONSTRAINT ${q(u.constraint_name)} ${kind} (${u.cols.split(", ").map(q).join(", ")});`);
  }
  for (const f of fks) {
    parts.push(
      `ALTER TABLE ${q(t)} ADD CONSTRAINT ${q(f.constraint_name)} FOREIGN KEY (${q(f.column_name)}) REFERENCES ${q(f.ref_table)} (${q(f.ref_column)});`,
    );
  }

  const { rows } = await client.query(`SELECT * FROM ${q(t)}`);
  if (rows.length === 0) {
    parts.push(`-- ${t}: 0 rows`);
  } else {
    const colList = cols.map((c) => q(c.column_name)).join(", ");
    for (const r of rows) {
      const vals = cols.map((c) => lit(r[c.column_name])).join(", ");
      parts.push(`INSERT INTO ${q(t)} (${colList}) VALUES (${vals});`);
    }
    parts.push(`-- ${t}: ${rows.length} rows`);
  }
  parts.push("");
  console.log(`Dumped ${t} (${rows.length} rows)`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.resolve("backups");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `legacy-${stamp}.sql`);
fs.writeFileSync(file, parts.join("\n"));
console.log(`\nBackup written to ${file} (${fs.statSync(file).size} bytes)`);

console.log("\nDropping...");
for (const t of legacy) {
  await client.query(`DROP TABLE IF EXISTS ${q(t)} CASCADE`);
  console.log(`  Dropped ${t}`);
}

const { rows: after } = await client.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
   ORDER BY table_name`,
);
console.log("\nRemaining tables:", after.map((r) => r.table_name).join(", "));
await client.end();
