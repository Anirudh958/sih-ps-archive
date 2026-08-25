import { db } from "../../lib/db.js";
import { json, methodNotAllowed } from "../../lib/http.js";
import { consumeRateLimit, verifyAccess } from "../../lib/session.js";

export default async function handler(request, response) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const session = await verifyAccess(request);
  if (!session) return json(response, 401, { error: "Access token required" });
  if (!await consumeRateLimit(session.sessionId, "detail", 30, 60)) return json(response, 429, { error: "Too many detail requests" });
  const id = String(request.query.id || "");
  if (!/^SIH\d{5}$/.test(id)) return json(response, 400, { error: "Invalid problem statement number" });
  const sql = db();
  // Locking the session row serializes first-time detail opens for one account, so
  // parallel requests cannot all observe the count below 60 and slip past the cap.
  const access = await sql`WITH lock_session AS (
      SELECT id FROM browse_sessions WHERE id = ${session.sessionId} FOR UPDATE
    ),
    seen AS (
      SELECT 1 FROM statement_accesses WHERE session_id = ${session.sessionId} AND ps_number = ${id}
    ),
    inserted AS (
      INSERT INTO statement_accesses (session_id, ps_number)
      SELECT ${session.sessionId}, ${id}
      FROM lock_session
      WHERE NOT EXISTS (SELECT 1 FROM seen)
        AND (SELECT COUNT(*) FROM statement_accesses WHERE session_id = ${session.sessionId}) < 60
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    SELECT EXISTS(SELECT 1 FROM seen) AS seen, EXISTS(SELECT 1 FROM inserted) AS inserted`;
  if (!access[0].seen && !access[0].inserted) return json(response, 429, { error: "This session has reached its full-statement viewing limit" });
  const rows = await sql`SELECT data FROM problem_statements WHERE ps_number = ${id}`;
  return rows.length ? json(response, 200, rows[0].data) : json(response, 404, { error: "Problem statement not found" });
}
