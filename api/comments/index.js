import { db } from "../../lib/db.js";
import { json, methodNotAllowed, validOrigin } from "../../lib/http.js";
import { consumeRateLimit, verifyAccess } from "../../lib/session.js";

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST']);
  const session = await verifyAccess(request);
  if (!session?.groupId) return json(response, 403, { error: "Join a team to use comments" });
  if (request.method === "POST" && !validOrigin(request)) return json(response, 403, { error: "Invalid origin" });
  if (!await consumeRateLimit(session.sessionId, "comments", request.method === "POST" ? 10 : 30, 60)) return json(response, 429, { error: "Too many comment requests" });
  const id = String(request.query.ps || "");
  if (!/^SIH\d{5}$/.test(id)) return json(response, 400, { error: "Invalid problem statement number" });
  const sql = db();
  if (request.method === 'GET') {
    const rows = await sql`SELECT id, display_name, body, created_at FROM group_comments WHERE group_key = ${session.groupId} AND ps_number = ${id} ORDER BY created_at DESC LIMIT 100`;
    return json(response, 200, { comments: rows });
  }
  const body = String(request.body?.body || "").trim();
  const displayName = session.displayName || "Team member";
  if (!body || body.length > 2000) return json(response, 400, { error: "Comment must be between 1 and 2000 characters" });
  const rows = await sql`INSERT INTO group_comments (group_key, ps_number, display_name, body) VALUES (${session.groupId}, ${id}, ${displayName.slice(0, 40)}, ${body}) RETURNING id, display_name, body, created_at`;
  return json(response, 201, { comment: rows[0] });
}
