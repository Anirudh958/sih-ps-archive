import assert from "node:assert/strict";
import fs from "node:fs";
import { parseCookies, validOrigin } from "/home/vignesh/sih/lib/http.js";

// Cookie parsing: duplicates, malformed pairs, bad encoding.
assert.equal(parseCookies({ headers: { cookie: "a=1; b=2" } }).b, "2");
assert.equal(parseCookies({ headers: { cookie: "sih_refresh=old; sih_refresh=new" } }).sih_refresh, "new", "last duplicate wins (browser sends longest path first)");
assert.deepEqual(parseCookies({ headers: { cookie: "novalue; =x; a=1" } }), { a: "1" }, "malformed pairs skipped");
assert.equal(parseCookies({ headers: { cookie: "a=%E0%A4%A" } }).a, "%E0%A4%A", "bad percent-encoding does not throw");
assert.deepEqual(parseCookies({ headers: {} }), {});

// Origin check: a missing header must not pass once APP_ORIGIN is configured.
const withOrigin = (o) => ({ headers: o === undefined ? {} : { origin: o } });
process.env.APP_ORIGIN = "https://sih.saireddy.dev";
assert.equal(validOrigin(withOrigin("https://sih.saireddy.dev")), true, "configured origin allowed");
assert.equal(validOrigin(withOrigin("https://evil.example")), false, "foreign origin rejected");
assert.equal(validOrigin(withOrigin(undefined)), false, "missing Origin rejected when configured");
process.env.APP_ORIGIN = "";
assert.equal(validOrigin(withOrigin(undefined)), true, "unconfigured deployment still runs");

// The refresh cookie must expire the legacy path too, or it can never be deleted.
const session = fs.readFileSync("/home/vignesh/sih/lib/session.js", "utf8");
for (const fn of ["setRefreshCookie", "clearRefreshCookie"]) {
  const body = session.slice(session.indexOf(`function ${fn}`));
  assert.match(body.slice(0, 400), /LEGACY_COOKIE_PATH/, `${fn} clears the legacy cookie path`);
}
assert.match(session, /if \(data\.user\.is_anonymous\) \{\s*\n\s*clearRefreshCookie\(response\);\s*\n\s*return null;/, "anonymous refresh tokens refused");
assert.match(session, /export async function endSessionByRefreshToken\(request, response\)/, "logout can revoke by refresh token alone");
assert.doesNotMatch(session, /Max-Age=0; Secure"/, "clear cookie no longer hardcodes Secure (broke local http)");

// DB TLS must fail closed in production instead of silently disabling verification.
const db = fs.readFileSync("/home/vignesh/sih/lib/db.js", "utf8");
assert.match(db, /NODE_ENV === "production" && !ca/, "production requires a CA for DB TLS");
assert.match(db, /SUPABASE_DB_CA_CERT_PEM/, "inline PEM configuration supported");

console.log("guard checks passed");
