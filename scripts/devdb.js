// Локальная PostgreSQL для разработки (embedded-бинарники из npm).
// Canary: этот коммит используется e2e-проверкой саммоуффа из админки.
// Запуск: npm run db:start
import EmbeddedPostgres from "embedded-postgres";

const dataDir = process.env.PG_DATA_DIR || "/home/user/pgdata";
const port = Number(process.env.PG_PORT || 5432);
const user = "postgres";
const password = "postgres";
const dbName = "uchebniki";

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: true,
});

await pg.initialise();
await pg.start();

const client = pg.getPgClient();
await client.connect();
const { rows } = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [dbName]
);
if (rows.length === 0) {
  await client.query(`CREATE DATABASE "${dbName}"`);
  console.log(`Database "${dbName}" created`);
}
await client.end();

console.log(
  `PostgreSQL ready: postgresql://${user}:${password}@localhost:${port}/${dbName}`
);

let stopping = false;
const shutdown = async (signal) => {
  if (stopping) return;
  stopping = true;
  console.log(`Received ${signal}, stopping Postgres...`);
  try {
    await pg.stop();
  } catch {
    // ignore
  }
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
