import crypto from "node:crypto";
import { db } from "../lib/db.js";
import { json, methodNotAllowed, validOrigin } from "../lib/http.js";
import { TEAM_MAX_MEMBERS, consumeRateLimit, teamSummary, verifyAccess } from "../lib/session.js";

const NAME_PATTERN = /^[\p{L}\p{N} _.-]+$/u;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, 32).toString("hex")}`;
}

export function verifyPassword(password, stored) {
  const [salt, key] = String(stored).split(":");
  if (!salt || !key) return false;
  const expected = Buffer.from(key, "hex");
  const actual = crypto.scryptSync(password, salt, expected.length || 32);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function readName(value, min, max) {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  return name.length >= min && name.length <= max && NAME_PATTERN.test(name) ? name : "";
}

// ponytail: seat count is read inside the UPDATE, so two simultaneous joins on the
// last seat can both succeed. Move to a members table with a unique seat index if
// teams ever need a hard cap.
async function claimSeat(sql, sessionId, teamId, displayName) {
  const rows = await sql`UPDATE browse_sessions SET group_key = ${teamId}, display_name = ${displayName}
    WHERE id = ${sessionId} AND revoked_at IS NULL AND expires_at > NOW()
      AND (group_key = ${teamId} OR (SELECT COUNT(*) FROM browse_sessions m
        WHERE m.group_key = ${teamId} AND m.revoked_at IS NULL AND m.expires_at > NOW()) < ${TEAM_MAX_MEMBERS})
    RETURNING id`;
  return rows.length > 0;
}

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!validOrigin(request)) return json(response, 403, { error: "Invalid origin" });
  const session = await verifyAccess(request);
  if (!session) return json(response, 401, { error: "Access token required" });
  if (!await consumeRateLimit(session.sessionId, "team", 10, 900)) return json(response, 429, { error: "Too many team attempts" });

  const { action, teamName, teamPassword, displayName } = request.body || {};
  if (action !== "create" && action !== "join") return json(response, 400, { error: "Choose create or join" });
  const name = readName(teamName, 3, 40);
  if (!name) return json(response, 400, { error: "Team name must be 3 to 40 letters, numbers, spaces, . _ or -" });
  const member = readName(displayName, 2, 40);
  if (!member) return json(response, 400, { error: `Enter a ${action === "create" ? "team leader" : "member"} name between 2 and 40 characters` });
  const password = String(teamPassword ?? "");
  if (password.length < 6 || password.length > 72) return json(response, 400, { error: "Team password must be 6 to 72 characters" });

  const sql = db();
  const nameKey = name.toLowerCase();
  let teamId;

  if (action === "create") {
    const created = await sql`INSERT INTO teams (id, name, name_key, password_hash, leader_name)
      VALUES (${crypto.randomBytes(12).toString("hex")}, ${name}, ${nameKey}, ${hashPassword(password)}, ${member})
      ON CONFLICT (name_key) DO NOTHING RETURNING id`;
    if (!created.length) return json(response, 409, { error: "That team name is already taken" });
    teamId = created[0].id;
  } else {
    const found = await sql`SELECT id, password_hash FROM teams WHERE name_key = ${nameKey}`;
    if (!found.length || !verifyPassword(password, found[0].password_hash)) return json(response, 403, { error: "Invalid team name or password" });
    teamId = found[0].id;
  }

  if (!await claimSeat(sql, session.sessionId, teamId, member)) {
    const full = await teamSummary(teamId);
    return json(response, 403, { error: full && full.members >= TEAM_MAX_MEMBERS ? `That team already has ${TEAM_MAX_MEMBERS} members` : "Session expired" });
  }
  return json(response, action === "create" ? 201 : 200, { team: await teamSummary(teamId) });
}
