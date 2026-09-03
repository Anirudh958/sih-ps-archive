# SIH Selection Desk → sih-ps-archive: markdown-backed problem statements

Date: 2026-09-03

## Problem

`sih-ps` serves 226 SIH 2026 problem statements out of Supabase Postgres. Every
cold browse costs a round trip to Supabase's shared transaction pooler, which is
regularly slower than five seconds and drops sockets mid-acquisition — `lib/db.js`
carries a retry written specifically for it. The statements only change when the
importer runs, so that latency buys nothing.

The same statements already exist as plain markdown in `sih-ps-archive`, a public
repository. This moves the app into that repository and reads the markdown
directly, leaving Supabase to do only what needs a database: accounts, teams,
reviews, votes and comments.

## Decisions

| Question | Decision |
|---|---|
| Data source | Read `2026/*.md` from the deployment. No network, no DB, no build step. |
| Year scope | 2026 only (226 statements). 2024 and 2025 stay markdown-only. |
| Auth on PS | Dropped. Statements become public; teams/reviews/votes/comments stay authenticated. |
| Git history | `merge --allow-unrelated-histories`; app commits and blame preserved. |
| Front page | Archive README stays; app README moves to `docs/APP.md`. |
| Anonymous SPA | Anonymous visitors browse; the login gate becomes on-demand. |

Reading local files rather than fetching `raw.githubusercontent.com`: after the
merge the markdown ships inside the deployment, so an HTTP fetch would add a
network hop, a rate limit and an external outage mode in order to solve a latency
problem. A data edit is a push, and a push redeploys, so freshness is unaffected.

Dropping the auth gate on statements: it no longer guards anything. The archive
repository is public, `api/statement.js` already server-renders every statement
with no auth check, and `app.js` only ever calls `/api/problems?all=1` — it
downloads all 226 full statements in one request and filters them in the browser.
The 12-per-page cap, the 60-statements-per-account cap, `api/problems/[id].js`
and `api/filters.js` were all already unreachable from the client.

## Architecture

```
sih-ps-archive/
  2024/ 2025/ 2026/        607 .md  ← source of truth (app serves 2026)
  index.html app.js styles.css theme-init.js
  api/
    problems/index.js      PUBLIC  226 PS as JSON      → lib/statements.js
    statement.js           PUBLIC  SSR statement pages → lib/statements.js
    sitemap.js             PUBLIC  228 urls            → lib/statements.js
    auth.js  session/refresh.js  team.js  reviews.js  comments/index.js
                           AUTH    → Supabase, unchanged
  lib/
    statements.js          NEW  read + parse 2026/*.md, module-scope cache
    db.js  session.js  http.js       unchanged
  supabase/schema.sql      PS tables removed
  scripts/                 dev.js  test-team.js  test-statements.js  checks/
  docs/APP.md  docs/ARCHITECTURE.md
  README.md  CONTRIBUTING.md  CODE_OF_CONDUCT.md  ATTRIBUTION.md  LICENSE
```

Supabase keeps `auth.users`, `browse_sessions`, `teams`, `team_members`,
`api_rate_buckets`, `throttle_buckets`, `group_comments`, `user_problem_reviews`,
`team_problem_votes`. It loses `problem_statements` and `statement_accesses`.

## lib/statements.js

Two exports, one module-scope cache, parsed once per function instance.

```
all()    → [problem], sorted by ps_number, sno = index + 1
byId(id) → problem | undefined
```

There is no `meta()`. Themes, organisations and totals are derived in the browser by
`loadMetadata()` from the one list response, and `api/filters.js` — the only server-side
consumer such an export would have had — is being deleted.

| markdown | field |
|---|---|
| filename `SIH26001.md` | `ps_number` |
| `# SIH26001 — X` | `title` = `X` |
| `**Organization:**` `**Department:**` `**Category:**` `**Theme:**` | `org` `department` `category` `theme` |
| `## Problem Statement` body | `description` (may be empty) |
| `## Expected Solution` or `## Expected Solutions` | `expected_solution` |
| `## Dataset` body | `dataset`, `dataset_link` = first URL, `has_dataset` |
| derived | `summary` = `(description \|\| expected_solution).slice(0, 400)` |
| derived | `sno` = index + 1 |

Two edge cases already present in the data: `SIH26031`, `SIH26032` and `SIH26033`
carry no `## Problem Statement` section at all, and two files spell the heading
`## Expected Solutions`. The parser treats every section as optional.

`deadline` is dropped — the archive has no source for it, and a hardcoded date
would age into a false statement in the detail sidebar. `innovation`, `effort`,
`verdict`, `verdict_score` and `competition_score` go too; they were schema
defaults (`"n/a"`, `0`) that never held real data.

`expected_solution` is gained. It is in the markdown, was never in the app, and
gets its own detail-view section rather than being parsed and discarded.

## Request paths

```
GET  /                         static shell, anonymous OK
GET  /api/problems             PUBLIC  226 PS, edge-cached 1h
GET  /problem-statements[/:id] PUBLIC  SSR
GET  /sitemap.xml              PUBLIC  228 urls
POST /api/auth  /api/session/refresh    Supabase
*    /api/team  /api/reviews  /api/comments    auth (+ team for comments)
```

`vercel.json` forces `private, no-store, max-age=0` on `/api/(.*)`. A rule for
`/api/problems` must be added *after* it — last match wins per header key — or the
CDN never caches the one response that is identical for every visitor, and the
parse re-runs on every cold start in every region. `includeFiles` gains `2026/**`
on the three functions that read markdown; `api/statement.js` keeps `index.html`.

## File-by-file

**New** — `lib/statements.js`; `scripts/test-statements.js`; `docs/APP.md` (app
README, badges repointed from `Vigneshrdy/sih-ps` to `DeadIndian/sih-ps-archive`).

**Rewritten**

- `api/problems/index.js` — 83 lines to roughly 12. No auth, no rate limit, no
  SQL, no pagination or filter branch. Returns `{ items, total }`.
- `api/statement.js` — `loadStatements()` reads `lib/statements.js`;
  `statementBody()` gains an Expected Solution section, loses the deadline fact.
- `api/sitemap.js` — ids from `lib/statements.js`.
- `supabase/schema.sql` — drop the `problem_statements` and `statement_accesses`
  definitions, the three `REFERENCES problem_statements` clauses, and those two
  tables from the RLS and `REVOKE` lists.
- `vercel.json` — `includeFiles: "2026/**"`; `/api/problems` cache rule.
- `app.js` — anonymous browsing, roughly 50 lines.
- `scripts/checks/guards.mjs` — retarget the assertions pinning the old design.
- `README.md` (archive) — Browse online block, link to `docs/APP.md`.
- `CONTRIBUTING.md` — archive version wins, gains a Code contributions section.
- `.gitignore` (archive) — today it ignores `*.json`, `scripts/` and `data/` under
  the rule "nothing but YEAR/SIHxxxxx.md belongs in this repository", which blocks
  `package.json` and `scripts/`. Rewritten for a repository that holds code.
- `docs/ARCHITECTURE.md` — data source and security model sections.
- `package.json` — drop `import:data`, add `test-statements.js` to `check`.
  Dependencies unchanged: `pg`, `jose` and `@supabase/supabase-js` still serve
  auth and teams.
- `LICENSE` — scope it to the code. The archive's `ATTRIBUTION.md` places the
  statement text with its original authors under CC BY 4.0, so a bare repo-wide
  MIT file would over-claim on 607 markdown files.

**Deleted** — `api/problems/[id].js` (60-cap, never called by the client);
`api/filters.js` (never called; `loadMetadata()` derives filters in the browser);
`scripts/import-data.js` (no `ps.json`, no table);
`344ad1dc8fd5dedd6f29ba338fdde914.txt` (stray 33-byte file); the app's `README.md`
(moved) and `CODE_OF_CONDUCT.md` (the archive's wins).

The `ps.json` lines in `.gitignore` and `.vercelignore` stay. Vercel uploads the working
directory rather than the git tree, so `.vercelignore` is what stops an untracked local
`ps.json` from being deployed — it guards a real accident even though nothing generates
that file any more.

## Postgres migration

Destructive, runs against the live Supabase database, and gated on its own
go-ahead. `schema.sql` declares these foreign keys inline, so their names are
Postgres-generated and must be confirmed before being dropped:

```sql
SELECT conname, conrelid::regclass FROM pg_constraint
WHERE confrelid = 'problem_statements'::regclass;

ALTER TABLE group_comments       DROP CONSTRAINT group_comments_ps_number_fkey;
ALTER TABLE user_problem_reviews DROP CONSTRAINT user_problem_reviews_ps_number_fkey;
ALTER TABLE team_problem_votes   DROP CONSTRAINT team_problem_votes_ps_number_fkey;
DROP TABLE statement_accesses;
DROP TABLE problem_statements;
```

Explicit constraint drops rather than `DROP TABLE ... CASCADE`, so nothing
unlisted disappears quietly. User data survives: `ps_number` stays a plain `TEXT`
column on all three tables and every existing review, vote and comment keeps its
row. `statement_accesses` is the only table whose data is discarded; it held
"which statements this session opened", for the 60-cap that is going away.

## Client changes

- `boot()` — the no-session path ends in `showGate()`. It becomes `startApp()`, so
  the list renders for anonymous visitors.
- `showGate()` — kept, but fires on explicit sign-in intent rather than on boot.
- `loadReviewsForProblems()`, `renderTeamBar()` — no-op without
  `state.accessToken`, so an anonymous browse makes exactly one request.
- The team bar offers Sign in; team, vote and comment actions open the gate
  instead of failing.
- `loadDataset()` — `api("/api/problems?all=1")` becomes a plain
  `fetch("/api/problems")`, with no bearer token, so a cold anonymous load never
  trips the refresh path.
- Star and compare already live in `localStorage`, so both work with no account.

## Testing

`scripts/test-statements.js`, `assert`-based, no framework: 226 records parsed;
`ps_number` unique and matching `/^SIH\d{5}$/`; `sno` contiguous 1 to 226; every
record has a non-empty `title`, `org`, `category` and `theme`; `SIH26031` parses
with an empty `description` and a non-empty `expected_solution`; `SIH26038` yields
a `dataset_link`; `all()` returns the same array on the second call.

`scripts/checks/guards.mjs` currently asserts five things that this change
invalidates — `api("/api/problems?all=1")` in `app.js`, the `request.query.all`
branch, `allStatements ||=`, `includeFiles === "index.html"`, and the rewrites
list. Each is retargeted at the new design rather than deleted.

`npm run check` runs both offline: no database, no network.

## Order of work

The merge comes first. `lib/statements.js` parses `2026/*.md`, and that directory only
exists in `sih-ps-archive`, so neither the parser nor its test can run in `sih-ps`.

1. In `sih-ps-archive`: rewrite `.gitignore` for a repository that holds code, then
   `merge --allow-unrelated-histories` from the `sih-ps` remote, resolving `README.md`,
   `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` by hand; app README to `docs/APP.md`.
2. `lib/statements.js` and its test. Rewrite the three read paths, delete the dead
   ones, update `guards.mjs`, `vercel.json`, `package.json` and `schema.sql`.
   `npm run check` green.
3. Client: anonymous browsing, plus `index.html` and `manifest.webmanifest`.
   `npm run check` green.
4. `scripts/checks/e2e-flow.mjs`: the statement assertions test routes that no longer
   exist. Retarget them at the public list.
5. Docs: `docs/APP.md`, `docs/ARCHITECTURE.md`, `LICENSE`, this spec.
6. Verify: `npm run check`, then `npm run dev` and load `/`, `/problem-statements`,
   `/problem-statements/SIH26001` and `/sitemap.xml`, both anonymous and signed in.
   The archive checkout needs its own `.env` and `npm install` — neither travels with a
   git merge.
7. Stop. Pushing, repointing Vercel and the Postgres migration each need their
   own go-ahead.

## Out of scope

Serving 2024 and 2025 through the app; a year filter in the UI; retiring the
`sih-ps` repository on GitHub; any change to the Supabase auth, team, review, vote
or comment logic.

