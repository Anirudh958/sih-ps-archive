import pg from "pg";
import fs from "node:fs";

const { Pool } = pg;
let pool;

// Supabase's shared transaction pooler intermittently drops a socket while the pool
// is still opening it, which surfaces as an acquisition timeout before any statement
// is sent. Retrying that once is safe precisely because nothing reached the server.
// A real SQL error always carries a SQLSTATE `code`, so it is never retried here.
const isAcquireFailure = (error) => !error?.code && /Connection terminated/i.test(error?.message || "");

async function run(text, values) {
  try {
    return (await pool.query(text, values)).rows;
  } catch (error) {
    if (!isAcquireFailure(error)) throw error;
    return (await pool.query(text, values)).rows;
  }
}

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const ca = process.env.SUPABASE_DB_CA_CERT ? fs.readFileSync(process.env.SUPABASE_DB_CA_CERT, "utf8") : null;
  pool ||= new Pool({
    connectionString: process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]+&?/i, "$1").replace(/[?&]$/, ""),
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 12000,   // Supabase's shared pooler is regularly slower than 5s
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  pool.on("error", () => {});  // a dropped idle client must not take the process down
  const sql = (strings, ...values) => run(strings.reduce((query, string, index) => `${query}${string}${index < values.length ? `$${index + 1}` : ""}`, ""), values);
  sql.query = (text, values) => run(text, values);
  return sql;
}
