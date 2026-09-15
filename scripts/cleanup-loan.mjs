// Служебное: удалить запись выдачи (id — аргумент).
import "dotenv/config";
const { Client } = await import("pg");
const id = process.argv[2];
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query("DELETE FROM loans WHERE id = $1", [id]);
console.log("deleted rows:", r.rowCount);
await c.end();
