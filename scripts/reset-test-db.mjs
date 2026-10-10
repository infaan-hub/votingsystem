import "dotenv/config";
import pg from "pg";

// Drops + recreates the test database, then re-applies migrations.
// ONLY ever touches a database whose name ends in `_test`.
const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error("TEST_DATABASE_URL is not set."); process.exit(1); }

const dbName = new URL(url).pathname.replace(/^\//, "").split("/")[0];
if (!dbName || !dbName.endsWith("_test")) {
  console.error(`Refusing: database name "${dbName}" must end in _test.`);
  process.exit(1);
}

const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();

await admin.query(
  `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
  [dbName],
);
await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
console.log(`Dropped ${dbName}`);
await admin.query(`CREATE DATABASE "${dbName}"`);
console.log(`Recreated ${dbName}`);
await admin.end();

const { execSync } = await import("node:child_process");
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
console.log("\nTest database reset and migrated.");