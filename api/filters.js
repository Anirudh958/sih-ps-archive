import { db } from "../lib/db.js";
import { json, methodNotAllowed } from "../lib/http.js";
import { consumeRateLimit, verifyAccess } from "../lib/session.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const session = await verifyAccess(request);
  if (!session) return json(response, 401, { error: "Access token required" });
  if (!await consumeRateLimit(session.sessionId, "filters", 20, 60)) return json(response, 429, { error: "Too many requests" });
  const sql = db();
  const [themes, orgs, stats] = await Promise.all([
    sql`SELECT DISTINCT theme FROM problem_statements ORDER BY theme`,
    sql`SELECT DISTINCT org FROM problem_statements ORDER BY org`,
    sql`SELECT COUNT(*)::int AS total, COUNT(DISTINCT theme)::int AS themes, COUNT(DISTINCT org)::int AS orgs FROM problem_statements`,
  ]);
  return json(response, 200, { themes: themes.map((row) => row.theme), orgs: orgs.map((row) => row.org), stats: stats[0] });
}
