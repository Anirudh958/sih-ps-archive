import crypto from "node:crypto";
import { consumeRateLimit, joinSession, verifyAccess } from "../../lib/session.js";
import { json, methodNotAllowed, validOrigin } from "../../lib/http.js";

function same(a, b) {
  const left = Buffer.from(a || "");
  const right = Buffer.from(b || "");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export default async function handler(request, response) {
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!validOrigin(request)) return json(response, 403, { error: "Invalid origin" });
  const session = await verifyAccess(request);
  if (!session) return json(response, 401, { error: "Access token required" });
  if (!await consumeRateLimit(session.sessionId, "group-join", 5, 900)) return json(response, 429, { error: "Too many group join attempts" });
  const { token, password, displayName } = request.body || {};
  if (!process.env.GROUP_TOKEN || !process.env.GROUP_PASSWORD) return json(response, 503, { error: "Group access is not configured" });
  if (!same(token, process.env.GROUP_TOKEN) || !same(password, process.env.GROUP_PASSWORD)) return json(response, 403, { error: "Invalid group credentials" });
  const name = String(displayName || "").trim().slice(0, 40);
  if (!/^[\p{L}\p{N} _.-]{2,40}$/u.test(name)) return json(response, 400, { error: "Use a display name between 2 and 40 characters" });
  const groupId = crypto.createHash("sha256").update(process.env.GROUP_TOKEN).digest("hex").slice(0, 24);
  const joined = await joinSession(session.sessionId, groupId);
  if (!joined) return json(response, 401, { error: "Session expired" });
  response.setHeader("Set-Cookie", `sih_name=${encodeURIComponent(name)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return json(response, 200, { groupName: "Team shortlist" });
}
