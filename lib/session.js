import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "./db.js";
import { parseCookies } from "./http.js";

const ACCESS_TTL_SECONDS = 300;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7;
const encoder = new TextEncoder();

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return encoder.encode(value);
}

function hash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(48).toString("base64url");
}

export async function createAccessToken(sessionId, groupId = "") {
  return new SignJWT({ sid: sessionId, scope: "browse", ...(groupId ? { gid: groupId } : {}) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer("sih-selection-desk")
    .setAudience("sih-browser")
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyAccess(request) {
  const header = request.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), secret(), {
      issuer: "sih-selection-desk",
      audience: "sih-browser",
    });
    return payload.sid ? { sessionId: payload.sid, groupId: payload.gid || "" } : null;
  } catch {
    return null;
  }
}

export async function issueSession(response, metadata = {}) {
  const sql = db();
  const sessionId = crypto.randomUUID();
  const refreshToken = randomToken();
  await sql`INSERT INTO browse_sessions (id, refresh_hash, expires_at, ip_hash, user_agent)
    VALUES (${sessionId}, ${hash(refreshToken)}, NOW() + INTERVAL '7 days', ${hash(metadata.ip || "unknown")}, ${metadata.userAgent || ""})`;
  setRefreshCookie(response, refreshToken);
  return { accessToken: await createAccessToken(sessionId), expiresIn: ACCESS_TTL_SECONDS };
}

export async function joinSession(sessionId, groupId) {
  const sql = db();
  const rows = await sql`SELECT id FROM browse_sessions WHERE id = ${sessionId} AND revoked_at IS NULL AND expires_at > NOW()`;
  if (!rows.length) return null;
  await sql`UPDATE browse_sessions SET group_key = ${groupId} WHERE id = ${sessionId}`;
  return createAccessToken(sessionId, groupId);
}

export async function rotateSession(request, response) {
  const refreshToken = parseCookies(request).sih_refresh;
  if (!refreshToken) return null;
  const sql = db();
  const nextToken = randomToken();
  const rows = await sql`UPDATE browse_sessions
    SET refresh_hash = ${hash(nextToken)}, rotated_at = NOW(), expires_at = NOW() + INTERVAL '7 days'
    WHERE refresh_hash = ${hash(refreshToken)} AND revoked_at IS NULL AND expires_at > NOW()
    RETURNING id`;
  if (!rows.length) {
    clearRefreshCookie(response);
    return null;
  }
  setRefreshCookie(response, nextToken);
  const current = await sql`SELECT group_key FROM browse_sessions WHERE id = ${rows[0].id}`;
  const groupId = current[0]?.group_key || "";
  return { accessToken: await createAccessToken(rows[0].id, groupId), expiresIn: ACCESS_TTL_SECONDS, groupJoined: Boolean(groupId) };
}

export async function consumeRateLimit(sessionId, route, limit, windowSeconds) {
  const sql = db();
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const rows = await sql`INSERT INTO api_rate_buckets (session_id, route, window_start, request_count)
    VALUES (${sessionId}, ${route}, TO_TIMESTAMP(${windowStart}), 1)
    ON CONFLICT (session_id, route, window_start)
    DO UPDATE SET request_count = api_rate_buckets.request_count + 1
    RETURNING request_count`;
  return rows[0].request_count <= limit;
}

function setRefreshCookie(response, value) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader("Set-Cookie", `sih_refresh=${encodeURIComponent(value)}; Path=/api/session; HttpOnly; SameSite=Strict; Max-Age=${REFRESH_TTL_SECONDS}${secure}`);
}

function clearRefreshCookie(response) {
  response.setHeader("Set-Cookie", "sih_refresh=; Path=/api/session; HttpOnly; SameSite=Strict; Max-Age=0; Secure");
}
