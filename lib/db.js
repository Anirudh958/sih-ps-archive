import pg from "pg";
import fs from "node:fs";

const { Pool } = pg;
let pool;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  const ca = process.env.SUPABASE_DB_CA_CERT ? fs.readFileSync(process.env.SUPABASE_DB_CA_CERT, "utf8") : null;
  pool ||= new Pool({
    connectionString: process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]+&?/i, "$1").replace(/[?&]$/, ""),
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  const sql = (strings, ...values) => {
    const text = strings.reduce((query, string, index) => `${query}${string}${index < values.length ? `$${index + 1}` : ""}`, "");
    return pool.query(text, values).then((result) => result.rows);
  };
  sql.query = (text, values) => pool.query(text, values).then((result) => result.rows);
  return sql;
}
