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
  try {
    const { url } = config();
    jwks ||= createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`), { cooldownDuration: 600000 });
    const { payload } = await jwtVerify(header.slice(7), jwks, { issuer: `${url}/auth/v1` });
    if (!payload.sub || payload.role !== "authenticated") return null;
    const sql = db();
    const rows = await sql`SELECT group_key, display_name FROM browse_sessions WHERE id = ${payload.sub} AND revoked_at IS NULL AND expires_at > NOW()`;
    return rows.length ? { sessionId: payload.sub, groupId: rows[0].group_key || "", displayName: rows[0].display_name || "" } : null;
  } catch {
    return null;
  }
}

export async function issueSession(response, metadata = {}) {
  const supabase = authClient();
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) return { error: error?.message || "Anonymous sign-in failed" };
  const sql = db();
  await sql`INSERT INTO browse_sessions (id, refresh_hash, expires_at, ip_hash, user_agent)
    VALUES (${data.user.id}, ${hash(data.session.refresh_token)}, NOW() + INTERVAL '7 days', ${hash(metadata.ip || "unknown")}, ${metadata.userAgent || ""})
    ON CONFLICT (id) DO UPDATE SET refresh_hash = EXCLUDED.refresh_hash, expires_at = EXCLUDED.expires_at,
      revoked_at = NULL, ip_hash = EXCLUDED.ip_hash, user_agent = EXCLUDED.user_agent`;
  setRefreshCookie(response, data.session.refresh_token);
  return { accessToken: data.session.access_token, expiresIn: data.session.expires_in, team: null };
}

export async function teamSummary(teamId) {
  if (!teamId) return null;
  const sql = db();
  const rows = await sql`SELECT t.name, t.leader_name,
      (SELECT COUNT(*)::int FROM browse_sessions m WHERE m.group_key = t.id AND m.revoked_at IS NULL AND m.expires_at > NOW()) AS members
    FROM teams t WHERE t.id = ${teamId}`;
  return rows.length ? { name: rows[0].name, leaderName: rows[0].leader_name, members: rows[0].members, maxMembers: TEAM_MAX_MEMBERS } : null;
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
  const sql = db();
  const rows = await sql`UPDATE browse_sessions SET refresh_hash = ${hash(data.session.refresh_token)}, rotated_at = NOW(), expires_at = NOW() + INTERVAL '7 days'
    WHERE id = ${data.user.id} AND revoked_at IS NULL RETURNING group_key`;
  if (!rows.length) {
    clearRefreshCookie(response);
    return null;
  }
  setRefreshCookie(response, data.session.refresh_token);
  return { accessToken: data.session.access_token, expiresIn: data.session.expires_in, team: await teamSummary(rows[0].group_key) };
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
  response.setHeader("Set-Cookie", `sih_refresh=${encodeURIComponent(value)}; Path=/api/session; HttpOnly; SameSite=Strict; Max-Age=${REFRESH_TTL_SECONDS}${secure}`);
}

function clearRefreshCookie(response) {
  response.setHeader("Set-Cookie", "sih_refresh=; Path=/api/session; HttpOnly; SameSite=Strict; Max-Age=0; Secure");
}
