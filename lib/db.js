import pg from "pg";

const { Pool } = pg;
let pool;

export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  pool ||= new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000, ssl: { rejectUnauthorized: false } });
  const sql = (strings, ...values) => {
    const text = strings.reduce((query, string, index) => `${query}${string}${index < values.length ? `$${index + 1}` : ""}`, "");
    return pool.query(text, values).then((result) => result.rows);
  };
  sql.query = (text, values) => pool.query(text, values).then((result) => result.rows);
  return sql;
}
