import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createClient } from "@supabase/supabase-js";
import { db } from "./db.js";
import { parseCookies } from "./http.js";

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;
export const TEAM_MAX_MEMBERS = 6;
let jwks;

function config() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("Supabase Auth is not configured");
  return { url: url.replace(/\/$/, ""), publishableKey };
}

function authClient() {
  const { url, publishableKey } = config();
  return createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function verifyAccess(request) {
  const header = request.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  let payload;
  try {
    const { url } = config();
    jwks ||= createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`), { cooldownDuration: 600000 });
    ({ payload } = await jwtVerify(header.slice(7), jwks, { issuer: `${url}/auth/v1` }));
  } catch {
    return null;                       // missing, malformed, or expired token
  }
  if (!payload.sub || payload.role !== "authenticated" || payload.is_anonymous) return null;
  // A database failure is deliberately not caught. Returning null would tell the
  // browser the session is gone and sign the user out over a transient blip; letting
  // it throw surfaces a 500 that the client reports without dropping the session.
  const sql = db();
  const rows = await sql`SELECT group_key, display_name FROM browse_sessions WHERE id = ${payload.sub} AND revoked_at IS NULL AND expires_at > NOW()`;
  return rows.length ? { sessionId: payload.sub, groupId: rows[0].group_key || "", displayName: rows[0].display_name || "" } : null;
}

// Signup and login both land here: record the session server-side and set the
// rotating refresh cookie. The browser never sees a Supabase key.
async function openSession(response, session, user, metadata) {
  const sql = db();
  await sql`INSERT INTO browse_sessions (id, refresh_hash, expires_at, ip_hash, user_agent)
    VALUES (${user.id}, ${hash(session.refresh_token)}, NOW() + INTERVAL '7 days', ${hash(metadata.ip || "unknown")}, ${metadata.userAgent || ""})
    ON CONFLICT (id) DO UPDATE SET refresh_hash = EXCLUDED.refresh_hash, expires_at = EXCLUDED.expires_at,
      revoked_at = NULL, ip_hash = EXCLUDED.ip_hash, user_agent = EXCLUDED.user_agent`;
  setRefreshCookie(response, session.refresh_token);
  const rows = await sql`SELECT group_key FROM browse_sessions WHERE id = ${user.id}`;
  return { accessToken: session.access_token, expiresIn: session.expires_in, email: user.email || "", team: await teamSummary(rows[0]?.group_key) };
}

export async function signUpUser(response, email, password, metadata = {}) {
  const { data, error } = await authClient().auth.signUp({ email, password });
  if (error) return { error: error.message };
  // Supabase returns no session when "Confirm email" is on for the project.
  if (!data.session) return { pending: true };
  return openSession(response, data.session, data.user, metadata);
}

export async function signInUser(response, email, password, metadata = {}) {
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error || !data.session) return { error: error?.message || "Could not sign in" };
  return openSession(response, data.session, data.user, metadata);
}

// Logout: revoke server-side so a leaked refresh token cannot revive the session.
// The publishable key cannot call auth.admin.signOut, so revoked_at is the real gate.
export async function endSession(sessionId, response) {
  clearRefreshCookie(response);
  if (sessionId) await db()`UPDATE browse_sessions SET revoked_at = NOW() WHERE id = ${sessionId}`;
}

export async function teamSummary(teamId) {
  if (!teamId) return null;
  const sql = db();
  const rows = await sql`SELECT t.id, t.name, t.leader_name FROM teams t WHERE t.id = ${teamId}`;
  if (!rows.length) return null;
  const members = await sql`SELECT display_name, is_lead, seat FROM team_members WHERE team_id = ${teamId} ORDER BY seat`;
  return {
    id: rows[0].id, name: rows[0].name, leaderName: rows[0].leader_name,
    members: members.length, maxMembers: TEAM_MAX_MEMBERS, full: members.length >= TEAM_MAX_MEMBERS,
    roster: members.map((row) => ({ name: row.display_name, isLead: row.is_lead })),
  };
}

export async function rotateSession(request, response) {
  const refreshToken = parseCookies(request).sih_refresh;
  if (!refreshToken) return null;
  const supabase = authClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    clearRefreshCookie(response);
    return null;
  }
  // Supabase has already invalidated the old token, so hand the new one to the
  // browser before touching the database. If the query below fails the request
  // errors, but the client keeps a usable token and can simply retry; persisting
  // it last would strand the session permanently on a transient database blip.
  setRefreshCookie(response, data.session.refresh_token);
  const sql = db();
  const rows = await sql`UPDATE browse_sessions SET refresh_hash = ${hash(data.session.refresh_token)}, rotated_at = NOW(), expires_at = NOW() + INTERVAL '7 days'
    WHERE id = ${data.user.id} AND revoked_at IS NULL RETURNING group_key`;
  if (!rows.length) {
    clearRefreshCookie(response);      // replaces the header set above
    return null;
  }
  return { accessToken: data.session.access_token, expiresIn: data.session.expires_in, email: data.user.email || "", team: await teamSummary(rows[0].group_key) };
}

export async function consumeRateLimit(sessionId, route, limit, windowSeconds) {
  const sql = db();
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const rows = await sql`INSERT INTO api_rate_buckets (session_id, route, window_start, request_count)
    VALUES (${sessionId}, ${route}, TO_TIMESTAMP(${windowStart}), 1)
    ON CONFLICT (session_id, route, window_start)
    DO UPDATE SET request_count = api_rate_buckets.request_count + 1 RETURNING request_count`;
  return rows[0].request_count <= limit;
}

function setRefreshCookie(response, value) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `sih_refresh=${encodeURIComponent(value)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${REFRESH_TTL_SECONDS}${secure}`);
}

function clearRefreshCookie(response) {
  response.setHeader("Set-Cookie", "sih_refresh=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0; Secure");
}
