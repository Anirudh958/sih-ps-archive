# HANDOFF — SIH Selection Desk

Written 2026-08-25, mid-task, at your request. Read "STOP — READ THIS FIRST" then
"WHERE I STOPPED".

---

## STOP — READ THIS FIRST

**The bug you reported (logged out on every refresh) is diagnosed and fixed in the
working tree, but the fix is NOT DEPLOYED.** Production still has the bug.

- `HEAD` = `6d0453c "updated website"` — contains all the *earlier* feature work and
  is what `sih.saireddy.dev` currently serves.
- **6 files are uncommitted** and contain the logout fix plus the security fixes:
  `api/auth.js`, `api/team.js`, `app.js`, `lib/http.js`, `lib/session.js`,
  `supabase/schema.sql`.
- Nothing was committed by me. Committing and deploying those 6 files is what ships
  the fix.

**One unverified edit.** The last thing I did was rewrite the login throttle in
`api/auth.js` (per-account + per-IP). It parses and `scripts/test-team.js` passes, but
it was **never run**. Verify it before you trust it — see "FIRST THREE THINGS TO DO".

**A test account is still in your production Supabase:**
`sih-diag-b8dffd09@sihcheck.local`. Remove it (see "CLEANUP OWED").

---

## WHAT THIS PROJECT IS

Static frontend (`index.html`, `app.js`, `styles.css`) + Vercel serverless functions
in `api/`, backed by Supabase Postgres and Supabase email/password Auth.

The browser **never talks to Supabase directly**. It calls Vercel functions, which
hold the Supabase publishable key and open their own Postgres connection via the
transaction pooler.

**This is why RLS is not the security control here** — `anon` and `authenticated` have
`REVOKE ALL` on every table, which closes the PostgREST path entirely rather than
filtering it. RLS is left enabled as a backstop. If anyone ever adds direct
browser-to-Supabase queries, real policies must be written first; the `REVOKE` is what
is protecting the data today.

Key paths:
- `/` — login gate when signed out, statement list when signed in
- `/problem-statements/:id` — full problem statement (`vercel.json` rewrite)
- `api/auth.js` — login / signup / logout
- `api/session/refresh.js` — restores a session from the HttpOnly cookie
- `lib/session.js` — all auth, cookie and team-summary logic
- `supabase/schema.sql` — the single source of truth for the schema (idempotent;
  `scripts/import-data.js` applies it)

---

## THE BUG YOU REPORTED — ROOT CAUSE (confirmed, not guessed)

Refresh logged you out because of a **stale cookie from the previous deployment**.

1. The old (anonymous-auth) code set the refresh cookie at `Path=/api/session`.
   The new code sets it at `Path=/api`. Both match `/api/session/refresh`, so your
   browser had two `sih_refresh` cookies and sent both.
2. The stale one held an **anonymous** refresh token, and **9 legacy anonymous
   `browse_sessions` rows were still valid and unrevoked**.
3. `rotateSession()` had no anonymous check, so it accepted that token and returned
   **HTTP 200 with an anonymous access token**.
4. `verifyAccess()` rejects `is_anonymous`, so **every** data call then returned 401.
5. `startApp()` threw → `showGate()` → back at the login page. Every reload.
6. It was **unkillable**: `clearRefreshCookie` used `Path=/api`, and a cookie can only
   be deleted by an *exact* path match — so the `Path=/api/session` cookie could never
   be removed, by logout or by anything else.

Proven against live production (before fixing):
```
POST /api/session/refresh  (anonymous cookie) -> 200, is_anonymous=true
GET  /api/filters                             -> 401
GET  /api/problems?page=1                     -> 401
GET  /api/team                                -> 401
```

### The three-part fix (in the uncommitted files)

1. `lib/session.js` — `rotateSession()` now refuses anonymous tokens outright
   (clears cookie, returns null → 401) instead of handing back a poisoned session.
2. `lib/session.js` — `setRefreshCookie` **and** `clearRefreshCookie` now emit two
   `Set-Cookie` headers, the second expiring the legacy `/api/session` path. This
   actively evicts the stale cookie on the next login or refresh.
   Also fixed: `clearRefreshCookie` used to hardcode `Secure`, which meant it could
   never clear the cookie over plain http locally.
3. Data fix, **already applied to your live DB**: all anonymous `browse_sessions`
   rows revoked (10 rows). `anonymous sessions still refreshable: 0`.

Verified locally against the patched code with a rebuilt poisoned cookie:
```
POST /api/session/refresh -> 401
Set-Cookie: sih_refresh=; Path=/api;         Max-Age=0
Set-Cookie: sih_refresh=; Path=/api/session; Max-Age=0
```

---

## SECURITY AUDIT — FINDINGS AND STATUS

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | Stale-cookie anonymous session poisoning (above) | **Critical** | Fixed, uncommitted |
| 2 | `/api/auth` had **no rate limiting** — unlimited password guessing | **High** | Fixed, **UNVERIFIED** |
| 3 | Team password guessing capped per account only; bypassable by registering more accounts | High | Fixed, unverified |
| 4 | `validOrigin()` returned `true` when the `Origin` header was **absent** — CSRF check skippable | Medium | Fixed |
| 5 | Unescaped data interpolated into `class="verdict ${...}"` (2 sites) | Medium | Fixed (`verdictClass()` allowlist) |
| 6 | `dataset_link` used in `href` with no scheme check — `javascript:` survives `escapeHtml` | Medium | Fixed (`safeUrl()`) |
| 7 | `lib/db.js` uses `ssl: { rejectUnauthorized: false }` — DB connection accepts any cert (MITM) | Medium | **NOT FIXED** — see below |
| 8 | `parseCookies` mishandled malformed pairs and threw on bad percent-encoding | Low | Fixed |
| 9 | `browse_sessions.group_key` has no FK — dangling refs after a team is deleted | Low | Data cleaned (12 rows); no FK added |
| 10 | Unlimited accounts ⇒ unlimited 60-statement scrape budgets | Low (by design) | Documented only |

### Finding 7 — the one I deliberately did not "fix"
`rejectUnauthorized: false` disables certificate **and** hostname verification on the
Postgres connection. I tested flipping it:

```
FAIL  rejectUnauthorized: true (system CAs) -> self-signed certificate in certificate chain
OK    rejectUnauthorized: false (current)
```

Supabase's pooler chain is self-signed, so flipping the flag **breaks all DB access**.
The code already supports the correct fix: download Supabase's CA cert and set
`SUPABASE_DB_CA_CERT` — then `lib/db.js` uses `{ ca, rejectUnauthorized: true }`
automatically. I did not do this because it needs a file from your dashboard.
Re-run `node scripts/checks/probe-db-tls.mjs` after adding it.

### Note on the throttle design (why it is shaped this way)
My first version counted *all* login attempts per IP. Testing showed it blocked a
**legitimate** login after an attacker burned the budget — your users are a campus
behind one NAT address, so one attacker could lock out everyone. The current design:

- only **failures** count (successful sign-ins never consume budget)
- tight cap **per (IP, email)**: 10 failures / 15 min — bounds guessing one account
- loose cap **per IP**: 150 failures / 15 min — stops mass enumeration without
  letting one attacker DoS a shared address

`throttle_buckets` is a new table for limits that exist before a session does.
**Already created in your live DB.**

---

## WHERE I STOPPED

Mid-verification of finding #2. Sequence:

1. Wrote the per-IP throttle → tested: 30 wrong passwords → `25 × 403, 5 × 429`. Good.
2. Then tested a *correct* login from the same IP → **429**. Bad: shared-IP DoS.
3. Rewrote it as per-account + per-IP (the current code).
4. **Stopped here — step 3 was never tested.**

The running dev server had a stale module cache at that point, so any test result you
see above step 3 does not reflect the current code.

---

## FIRST THREE THINGS TO DO

```bash
# 1. Start the server fresh (module cache matters — always restart after editing api/ or lib/)
node --env-file=.env scripts/dev.js        # http://localhost:3000

# 2. Verify the rewritten throttle: guessing ONE account is bounded,
#    but a DIFFERENT account's correct login from the same IP still works.
#    Create a test account first:
node --env-file=.env scripts/checks/make-test-account.mjs   # prints email; password DiagPassword123!

#    then ~15 wrong guesses at victim@example.com  -> expect 403s then 429
#    then a correct login at the test account      -> MUST still be 200  (this is the bit that failed before)

# 3. Offline checks
node scripts/test-team.js
node scripts/checks/guards.mjs
```

Then commit and deploy the 6 files. That is what actually fixes your reported bug.

---

## INCOMPLETE / NOT DONE

1. **Throttle rewrite unverified** (above). Highest priority.
2. **Full e2e regression not re-run** since the security fixes. The `validOrigin`
   change (missing `Origin` now rejected) and the `parseCookies` rewrite are on the
   auth path and deserve a full pass.
3. **The 27-check e2e script is LOST.** It lived in `/tmp/sihcheck/flow.mjs` and `/tmp`
   was wiped. It covered, against the real handlers + real Supabase:
   - all 5 protected routes refuse an unauthenticated caller
   - wrong credentials / short password / malformed email rejected
   - signup returns the pending state; login issues a session
   - reload survives on the refresh cookie alone
   - list = 226 statements, 12/page; full statement byte-identical to the stored record
   - creator becomes lead at 1/6; team name unique case-insensitively
   - 5 more join to 6/6; 7th refused with the exact message; duplicate join refused;
     wrong team password refused; DB holds exactly 6 rows
   - comment posts, attributed by joined name, visible to a teammate; non-member 403
   - leaving frees a seat and it is reused (seats stay 1–6, no gaps)
   - a departing lead's role is inherited; an emptied team is deleted
   - logout clears the cookie and a pre-logout token stops working
   Rebuilding this is worth an hour. `scripts/checks/make-test-account.mjs` gives you
   the account-creation half (Supabase has email confirmation ON, so signup alone
   cannot produce a usable session — that script inserts a confirmed user directly,
   including the `auth.identities` row GoTrue requires).
4. **Browser re-verification not redone** since the security fixes.
5. **Finding 7 (DB TLS)** — needs `SUPABASE_DB_CA_CERT`.
6. Not implemented, deliberately (recommendations, not bugs):
   - FK `browse_sessions.group_key → teams(id) ON DELETE SET NULL`. Blocked on the
     fact that `ALTER TABLE ... ADD CONSTRAINT` has no `IF NOT EXISTS`, and
     `scripts/import-data.js` splits `schema.sql` on `;` so a `DO $$ … $$` block would
     be shredded. Needs either a migration runner or a smarter splitter.
   - No cleanup job for `api_rate_buckets` / `throttle_buckets` / expired
     `browse_sessions`. They grow forever. A daily `DELETE WHERE window_start < …`
     would do it.
   - Scrape ceiling: the 60-statement cap is per account and accounts are free, so a
     determined scraper just registers more. The Cloudflare WAF rules in `README.md`
     are the real mitigation and are **required**, not optional.

---

## CLEANUP OWED

```bash
# Remove the diagnostic account I created in your production Supabase.
# (adapt scripts/checks/make-test-account.mjs, or run in SQL editor)
```
```sql
DELETE FROM auth.identities WHERE provider_id = 'sih-diag-b8dffd09@sihcheck.local';
DELETE FROM browse_sessions WHERE id IN (SELECT id FROM auth.users WHERE email = 'sih-diag-b8dffd09@sihcheck.local');
DELETE FROM auth.users WHERE email = 'sih-diag-b8dffd09@sihcheck.local';
```

Also present, harmless: 10 legacy **anonymous** `auth.users` rows. All their
`browse_sessions` are revoked so they cannot sign in. Delete them if you want a clean
`auth.users`.

---

## CHANGES ALREADY APPLIED TO YOUR LIVE DATABASE

These are done — do not redo them:
- `throttle_buckets` table created
- all anonymous `browse_sessions` revoked (10 rows)
- 12 `browse_sessions.group_key` values pointing at deleted teams cleared
- teams/memberships/comments emptied of my test data (`0 teams, 0 memberships, 0 comments`)
- `problem_statements` intact at **226**

---

## SUPABASE DASHBOARD SETTINGS THAT AFFECT BEHAVIOUR

Current live values (I read them from the API):
- `mailer_autoconfirm: false` → **email confirmation is ON**, so signup returns
  `202 {pending:true}` and the "Check your email…" message, not a session. Both paths
  are handled in the UI. Turn it **off** for a hackathon if you want signup → straight in.
- `external.anonymous_users: true` → **anonymous sign-in is still enabled.** Turn it
  **off**. The app rejects anonymous tokens, and leaving it on is what made the
  stale-cookie bug possible in the first place.
- CAPTCHA must stay **disabled** (the browser sends no captcha token).

---

## EARLIER WORK IN THIS SESSION (already in `HEAD`, already deployed)

Context for why the code looks the way it does. Seven bugs found by actually driving
a browser, all fixed and verified before that commit:

1. **Every deep link was broken** — `index.html` loaded `app.js`/`styles.css`
   *relatively*, so `/problem-statements/SIH26038` fetched
   `/problem-statements/app.js`. No JS executed at all. Now absolute (`/app.js`).
2. **Team seats leaked** — `MAX(seat)+1` never reused a vacated seat, so after the
   lead left, the next join computed seat 7 → "Team is full" with 5 members. Now takes
   the lowest free seat via `generate_series`.
3. **A leaving lead orphaned the team**, breaking "exactly one Team Lead" — that is
   how the leaderless `teams` rows in your DB appeared. Now the lowest remaining seat
   inherits; an emptied team is deleted.
4. **`rotateSession` could log users out permanently** — Supabase invalidates the old
   refresh token when issuing a new one, but the new one was sent to the browser
   *after* the DB write. Any failure between them stranded the session forever. It bit
   my own test session. Cookie now goes first.
5. **The team bar rendered while logged out** — `.group-bar { display: flex }` outranks
   the UA's `[hidden]` rule. Replaced four per-element patches with one global
   `[hidden] { display: none !important }`.
6. **The app shell was keyboard-reachable behind the login gate** — Tab walked into
   the search box and filters. Views are now genuinely hidden until authenticated.
7. **A transient DB blip signed users out** — `verifyAccess` caught everything and
   returned `null`, which reads as "not signed in". Now only token problems return
   `null`; DB failures throw → 500 → session survives.

Also from that pass: `/api/filters` fired 3 queries in `Promise.all` against a pool of
`max: 3`, so one request saturated the pool and it was the first endpoint to fail —
now a single query. Plus a one-shot retry in `lib/db.js` for pre-flight connection
drops (never for real SQL errors — a real SQL error always carries a SQLSTATE `code`).

**The 6-member cap is enforced by database constraints, not handler code:**
`CHECK (seat BETWEEN 1 AND 6)`, `UNIQUE (team_id, seat)`,
`PRIMARY KEY (team_id, user_id)`, a partial unique index for one lead, and an FK on
`team_members.user_id → auth.users`. Direct SQL writes that skip the API were verified
refused with `23514` / `23505` / `23503`.

---

## GOTCHAS THAT COST ME TIME

- **Restart `scripts/dev.js` after editing anything in `api/` or `lib/`.** It uses
  dynamic `import()`, which caches. I chased a "bug" for a while that was just a stale
  module.
- **Supabase's shared pooler is genuinely flaky.** Intermittent
  `Connection terminated due to connection timeout`. It derailed verification three
  times and looked like app bugs. `lib/db.js` now retries acquisition failures once.
  If a browser test fails oddly, check the server log before suspecting the code.
- **Supabase rejects `@example.com`** on signup, and every signup sends a real email
  (limit ~2/hour). That is why test accounts are created directly in `auth.users`.
- **GoTrue cannot scan NULL into its string fields.** A hand-made `auth.users` row
  needs `confirmation_token`, `recovery_token`, `email_change*`, `phone_change*`,
  `reauthentication_token` set to `''` **and** a matching `auth.identities` row, or
  login fails with "Database error querying schema".
- `scripts/dev.js` adds `http://localhost:3000` to `APP_ORIGIN` at runtime so the
  origin check passes locally. With the finding-#4 fix, a POST with **no** `Origin`
  header is now rejected whenever `APP_ORIGIN` is set — use `-H "Origin: …"` in curl.
- `git status` looked wrong to me mid-session because the earlier work had been
  committed as `6d0453c` outside my actions. Check `git log` before trusting memory.

---

## SALVAGED SCRIPTS (`scripts/checks/`)

Diagnostic throwaways, kept because `/tmp` was already wiped once. Not a test suite.
All need `--env-file=.env`. **They touch your real database.**

| Script | What it does |
|---|---|
| `make-test-account.mjs` | Creates a confirmed, loginable account (no email sent) |
| `repro-anon-cookie.mjs` | Rebuilds the poisoned anonymous-cookie state that caused the logout bug |
| `audit-sessions.mjs` | Lists `browse_sessions` with anon / valid / revoked / team |
| `revoke-anon-sessions.mjs` | Revokes anonymous sessions (already run) |
| `apply-schema-and-clean.mjs` | Applies `schema.sql`, clears dangling `group_key` |
| `probe-db-tls.mjs` | Tests whether the DB cert verifies (finding 7) |
| `guards.mjs` | Unit checks for `parseCookies`, `validOrigin`, cookie/anon guards |

`scripts/test-team.js` is the real committed check (team constraints + no-clipping CSS
assertions). It passes.
