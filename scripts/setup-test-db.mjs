import "dotenv/config";
import pg from "pg";

// Creates the test database and applies migrations to it, so the suite never
// runs against production. Requires TEST_DATABASE_URL to point at a database
// whose name ends in `_test`.
//
//   TEST_DATABASE_URL="postgresql://.../voting_test?sslmode=require" npm run db:test-setup

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("TEST_DATABASE_URL is not set.");
  console.error("Example: postgresql://user:pass@host/voting_test?sslmode=require");
  process.exit(1);
}

let dbName;
try {
  dbName = new URL(url).pathname.replace(/^\//, "").split("/")[0];
} catch {
  dbName = null;
}
if (!dbName || !dbName.endsWith("_test")) {
  console.error(`Refusing: database name "${dbName}" must end in _test.`);
  process.exit(1);
}

// Connect to the maintenance database so we can CREATE DATABASE if needed.
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();

const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
if (rows.length === 0) {
  // Identifier can't be a parameter, so quote it. Name is validated above.
  await admin.query(`CREATE DATABASE "${dbName}"`);
  console.log(`Created database ${dbName}`);
} else {
  console.log(`Database ${dbName} already exists`);
}
await admin.end();

console.log("Applying migrations...");
const { execSync } = await import("node:child_process");
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});

console.log("\nTest database ready. Run the suite with:");
console.log("  npm test");
