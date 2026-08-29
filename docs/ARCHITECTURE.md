# Architecture

SIH Selection Desk: a static frontend + Vercel serverless functions, backed by
Supabase Postgres and Supabase email/password Auth. No framework, no build step.

## Layout

```
index.html / app.js / styles.css   static frontend (vanilla JS, client-side routing)
api/                               Vercel serverless functions
  auth.js                          login / signup / logout
  session/refresh.js               restores a session from the HttpOnly cookie
  problems/index.js                paginated, filtered list (12/page)
  problems/[id].js                 one full statement (rate-limited per account)
  team.js                          create / join / leave team
  reviews.js                       reading state, decision, votes
  comments/index.js                team-private comments
  filters.js                       filter metadata (single query)
lib/
  db.js                            pg pool → Supabase transaction pooler (port 6543)
  session.js                       JWT verification, refresh rotation, team summary
  http.js                          JSON helper, cookie parser, origin check
supabase/schema.sql                single source of truth for the schema (idempotent)
scripts/
  dev.js                           local dev server mimicking the Vercel runtime
  import-data.js                   applies schema + upserts ps.json rows
  test-team.js                     offline checks (team rules, CSS guards)
  checks/                          diagnostics — touch the real database, not a test suite
```

## Request flow

```
browser → Bearer access token → Vercel function
  → jwtVerify against Supabase JWKS (jose, cached 10 min)
  → browse_sessions row must exist, unrevoked, unexpired
  → per-account rate limit in Postgres
  → pg pool → transaction pooler → Postgres
```

The browser never talks to Supabase directly. Functions hold the publishable
key and open their own Postgres connection.

## Sessions

Supabase issues and refreshes the JWT; this app never creates its own.
Refresh tokens are opaque, stored in a secure HTTP-only cookie, hashed
(sha256) in Postgres, and rotated on every refresh — the token is bound to an
IP hash and user agent. Anonymous tokens (`is_anonymous`) are refused at both
`verifyAccess` and `rotateSession`. `verifyAccess` only returns `null` for
missing/malformed/expired tokens; a database failure throws a 500 so the
client keeps its session instead of being told it is signed out.

## Security model

`ps.json` is never deployed or committed (`.gitignore` + `.vercelignore`;
verify with `git ls-files ps.json` before every deploy). Browsers can only
request 12 summary records per list request, one complete statement per detail
request, at most 60 distinct complete statements per seven-day account, and
comments belonging to the joined team.

Where the enforcement actually lives:

- **RLS policies are not the control here.** `anon` and `authenticated` have
  `REVOKE ALL` on every table, so the PostgREST path is closed outright rather
  than filtered — strictly tighter than a policy. RLS is left enabled as a
  backstop. If direct browser-to-Supabase queries are ever added, real
  policies must be written first; the `REVOKE` is what protects the data today.
- **Team limits are database constraints, not handler checks.**
  `team_members.seat` carries `CHECK (seat BETWEEN 1 AND 6)` and
  `UNIQUE (team_id, seat)`, so a seventh row cannot be inserted even by a
  direct SQL write. `PRIMARY KEY (team_id, user_id)` blocks duplicate joins, a
  partial unique index blocks a second team lead, and `user_id` has a foreign
  key to `auth.users`.

Production refuses to connect to Postgres without a verified CA
(`SUPABASE_DB_CA_CERT` or `SUPABASE_DB_CA_CERT_PEM`).

## Teams

Seat 1 is the team lead; a joiner takes the lowest free seat, so a vacated
seat is reused. When the lead leaves, the remaining member with the lowest
seat inherits the role; when the last member leaves, the team row is deleted.
Team names are unique deployment-wide (case-insensitive); team passwords are
salted and scrypt-hashed. `group_key` has no foreign key, so deleting a team
leaves historical team notes in Postgres under the old team id (unreachable,
harmless).

## Resilience notes

Supabase's shared transaction pooler intermittently drops a connection while
the pool is still opening it. Three deliberate choices keep that from logging
people out:

- `lib/db.js` retries once when a query fails before reaching the server (no
  SQLSTATE `code` + `Connection terminated` message). A real SQL error always
  carries a code and is never retried.
- `verifyAccess` lets database failures throw rather than return `null`.
- `rotateSession` sends the new refresh cookie to the browser *before* writing
  to Postgres. Supabase invalidates the old token the moment it issues a new
  one, so persisting the cookie last would strand the session permanently
  whenever that write failed.

On the client, only a `401` from `/api/session/refresh` returns the user to
the login screen; any other failure is retried once and then reported without
dropping the session.

## Supabase dashboard settings that affect behavior

- `mailer_autoconfirm` — email confirmation on/off; both signup paths are
  handled by the UI. Off = straight in after signup (best for a hackathon).
- `external.anonymous_users` — keep **off**. The app rejects anonymous tokens;
  leaving it on enabled the stale-anonymous-cookie logout bug.
- CAPTCHA — keep **disabled**; the browser sends no captcha token.

## Gotchas

- Restart `scripts/dev.js` after editing anything in `api/` or `lib/` — it
  caches dynamic `import()`s.
- The shared pooler is genuinely flaky (`Connection terminated due to
  connection timeout`). If a browser test fails oddly, check the server log
  before suspecting the code.
- Supabase rejects `@example.com` on signup and sends a real email per signup
  (~2/hour limit). Test accounts are created directly in `auth.users` via
  `scripts/checks/make-test-account.mjs` — a hand-made `auth.users` row needs
  all the token columns set to `''` **and** a matching `auth.identities` row,
  or GoToTrue fails with "Database error querying schema".
- With `APP_ORIGIN` set, a POST with no `Origin` header is rejected — use
  `-H "Origin: …"` in curl.
- `scripts/checks/` diagnostics all need `--env-file=.env` and touch the real
  database. `scripts/test-team.js` is the committed offline check.
