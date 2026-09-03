import assert from "node:assert/strict";
import fs from "node:fs";
import { parseCookies, validOrigin } from "../../lib/http.js";

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
const session = fs.readFileSync(new URL("../../lib/session.js", import.meta.url), "utf8");
for (const fn of ["setRefreshCookie", "clearRefreshCookie"]) {
  const body = session.slice(session.indexOf(`function ${fn}`));
  assert.match(body.slice(0, 400), /LEGACY_COOKIE_PATH/, `${fn} clears the legacy cookie path`);
}
assert.match(session, /if \(data\.user\.is_anonymous\) \{\s*\n\s*clearRefreshCookie\(response\);\s*\n\s*return null;/, "anonymous refresh tokens refused");
assert.match(session, /export async function endSessionByRefreshToken\(request, response\)/, "logout can revoke by refresh token alone");
assert.doesNotMatch(session, /Max-Age=0; Secure"/, "clear cookie no longer hardcodes Secure (broke local http)");

// DB TLS must fail closed in production instead of silently disabling verification.
const db = fs.readFileSync(new URL("../../lib/db.js", import.meta.url), "utf8");
assert.match(db, /SUPABASE_DB_CA_CERT_PEM/, "inline PEM configuration supported");
assert.match(db, /ssl: ca \? \{ ca, rejectUnauthorized: true \} : \{ rejectUnauthorized: false \}/, "DB uses verified TLS when a CA is configured and falls back otherwise");

// The CSP has no 'unsafe-inline', so any inline executable <script> in index.html is
// dead code. A saved dark theme silently reverted to light on reload because of
// exactly that. JSON-LD data blocks are exempt: they are never executed, so
// script-src does not block them and Googlebot still reads them from the DOM.
const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");
assert.doesNotMatch(html, /<script(?![^>]*\b(?:src=|type="application\/ld\+json"))/, "no inline executable scripts (CSP script-src 'self' blocks them)");
assert.match(html, /<script src="\/theme-init\.js"><\/script>/, "theme restored from an external script before paint");

// The statement list and detail pages both read one bulk response from Supabase.
// Fetching a static /ps.json instead silently emptied the site, because ps.json is
// gitignored and therefore never deployed.
const app = fs.readFileSync(new URL("../../app.js", import.meta.url), "utf8");
assert.match(app, /api\("\/api\/problems\?all=1"\)/, "statements load from the bulk endpoint");
assert.doesNotMatch(app, /fetch\("\/ps\.json"\)/, "no dependency on the undeployed ps.json");
const listApi = fs.readFileSync(new URL("../../api/problems/index.js", import.meta.url), "utf8");
assert.match(listApi, /if \(request\.query\.all\)/, "bulk branch served by the list endpoint");
assert.match(listApi, /allStatements \|\|=/, "bulk response cached for the function's lifetime");

// api/statement.js rewrites the shell's metadata by matching exact tags in
// index.html. A reformat there would silently serve homepage metadata on all 229
// statement pages, so every anchor it depends on is asserted here.
for (const anchor of [
  '<link rel="canonical" href="https://sih.saireddy.dev/" />',
  '<meta name="description" content="',
  '<section class="access-gate access-gate-loading" id="boot-screen"',
  '<article class="detail-view" id="detail-view" hidden',
  '<div class="detail-body" id="detail-body">',
  '<h1 id="page-title">',
  "<body>",
]) assert.ok(html.includes(anchor), `index.html keeps the anchor api/statement.js rewrites: ${anchor}`);
assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, "exactly one h1 in the shell");

const statement = fs.readFileSync(new URL("../../api/statement.js", import.meta.url), "utf8");
assert.match(statement, /s-maxage=3600/, "statement pages are CDN-cached, not rendered per crawl");
const vercel = JSON.parse(fs.readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
assert.deepEqual(vercel.rewrites.map((r) => r.destination),
  ["/api/statement", "/api/statement?id=:id", "/api/sitemap"], "public routes reach the renderers");
assert.equal(vercel.functions["api/statement.js"].includeFiles, "index.html", "the shell ships with the function that reads it");

console.log("guard checks passed");
