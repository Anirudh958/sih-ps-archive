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
  const access = await sql.transaction(async (tx) => {
    await tx`SELECT id FROM browse_sessions WHERE id = ${session.sessionId} FOR UPDATE`;
    const seen = await tx`SELECT 1 FROM statement_accesses WHERE session_id = ${session.sessionId} AND ps_number = ${id}`;
    if (!seen.length) {
      const counts = await tx`SELECT COUNT(*)::int AS total FROM statement_accesses WHERE session_id = ${session.sessionId}`;
      if (counts[0].total >= 60) return { overLimit: true, data: null };
      await tx`INSERT INTO statement_accesses (session_id, ps_number) VALUES (${session.sessionId}, ${id}) ON CONFLICT DO NOTHING`;
    }
    const rows = await tx`SELECT data FROM problem_statements WHERE ps_number = ${id}`;
    return { overLimit: false, data: rows[0]?.data || null };
  });
  if (access.overLimit) return json(response, 429, { error: "This session has reached its full-statement viewing limit" });
  return access.data ? json(response, 200, access.data) : json(response, 404, { error: "Problem statement not found" });
}
