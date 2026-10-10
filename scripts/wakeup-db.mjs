import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

async function wake(label, connectionString) {
  const started = Date.now();
  try {
    const c = new Client({ connectionString, connectionTimeoutMillis: 60000 });
    await c.connect();
    const r = await c.query("SELECT 1 AS ok, now() AS server_time");
    const elapsed = Date.now() - started;
    console.log(
      `${label}: OK after ${elapsed}ms — server_time=${r.rows[0].server_time.toISOString()}`,
    );
    await c.end();
    return true;
  } catch (error) {
    const elapsed = Date.now() - started;
    console.log(`${label}: FAILED after ${elapsed}ms — ${error.message}`);
    return false;
  }
}

await wake("production", process.env.DATABASE_URL);
await wake("test", process.env.TEST_DATABASE_URL ?? "");