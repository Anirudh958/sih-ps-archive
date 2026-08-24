import { db } from "../lib/db.js";
import { json, methodNotAllowed } from "../lib/http.js";
import { consumeRateLimit, verifyAccess } from "../lib/session.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const session = await verifyAccess(request);
  if (!session) return json(response, 401, { error: "Access token required" });
  if (!await consumeRateLimit(session.sessionId, "filters", 20, 60)) return json(response, 429, { error: "Too many requests" });
  const sql = db();
  // One round trip, one pooled connection. Three parallel queries used to saturate
  // the pool (max 3) on a single request, which made this the first endpoint to fail
  // whenever the shared pooler was slow.
  const rows = await sql`SELECT
    (SELECT array_agg(DISTINCT theme ORDER BY theme) FROM problem_statements) AS themes,
    (SELECT array_agg(DISTINCT org ORDER BY org) FROM problem_statements) AS orgs,
    (SELECT COUNT(*)::int FROM problem_statements) AS total,
    (SELECT COUNT(DISTINCT theme)::int FROM problem_statements) AS theme_count,
    (SELECT COUNT(DISTINCT org)::int FROM problem_statements) AS org_count`;
  return json(response, 200, {
    themes: rows[0].themes || [],
    orgs: rows[0].orgs || [],
    stats: { total: rows[0].total, themes: rows[0].theme_count, orgs: rows[0].org_count },
  });
}
