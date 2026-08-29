# SIH Selection Desk

A Vercel-hosted SIH problem-statement browser with Supabase email/password Auth, rotating refresh tokens, server-side filtering, pagination, Supabase Postgres storage, six-member teams, and private per-team comments.

## Security Boundary

`ps.json` must not be deployed or committed. It is used once from your local machine to import the statements into Supabase Postgres. Browsers can only request:

- 12 summary records per list request
- One complete statement per detail request
- At most 60 distinct complete statements per seven-day account
- Comments belonging to the joined team

Every API route requires a verified Supabase access token, so a logged-out caller gets `401` and no data. This slows and detects bulk collection but cannot make publicly displayed information impossible to copy. Cloudflare rate limits and bot management are still required in front of Vercel.

### Where the enforcement actually lives

The browser never talks to Supabase directly — it calls Vercel functions, which hold the Supabase publishable key and open their own Postgres connection. Two consequences worth knowing:

- **RLS policies are not the control here.** `anon` and `authenticated` have `REVOKE ALL` on every table, so the PostgREST path is closed outright rather than filtered. That is strictly tighter than a policy, and RLS is left enabled on all tables as a backstop. If you ever add direct browser-to-Supabase queries, you must write real policies first — the `REVOKE` is what is protecting you today.
- **Team limits are database constraints, not handler checks.** `team_members.seat` carries `CHECK (seat BETWEEN 1 AND 6)` and `UNIQUE (team_id, seat)`, so a seventh row cannot be inserted even by a direct SQL write. `PRIMARY KEY (team_id, user_id)` blocks duplicate joins, a partial unique index blocks a second team lead, and `user_id` has a foreign key to `auth.users`. Calling the API by hand cannot get past any of them.

Both `.gitignore` and `.vercelignore` exclude `ps.json` as defense in depth. Before every deployment, verify it is absent with `git ls-files ps.json` (the command should print nothing).

## 1. Create Private Storage

1. Open your Supabase project and run [`supabase/schema.sql`](/home/vignesh/sih/supabase/schema.sql) in **SQL Editor**.
2. In **Project Settings -> Database**, copy the **Transaction pooler** connection string, which uses port `6543`.
3. Install dependencies with `npm install`.
4. Create a local `.env` from `.env.example` and set `DATABASE_URL`.
5. Keep `ps.json` in this directory locally. It is already excluded by `.gitignore`.
6. Run `npm run import:data`.

The import creates the schema and uploads all records as private Postgres rows. After a successful import, `ps.json` is not needed by Vercel.

The app uses the Supabase publishable key only inside Vercel functions to call Auth. It verifies user JWTs using the Supabase JWKS URL. The `kid` shown in the JWKS response is only a key identifier, not a secret. Keep any `service_role` or `sb_secret_*` key out of the browser, GitHub, and public Vercel variables.

## 2. Configure Supabase Auth

1. In Supabase Dashboard, open **Authentication -> Providers** and enable **Email**.
2. Disable **Anonymous Sign-Ins** — the app rejects anonymous tokens.
3. Under **Authentication -> Providers -> Email**, decide on **Confirm email**:
   - **Off** (fastest for a hackathon): signup returns a session and the user lands on the desk immediately.
   - **On**: signup returns `202` and the UI says *"Check your email to confirm the account, then log in."* Both paths are handled.
4. In **Authentication -> Bot and Abuse Protection**, leave CAPTCHA protection **disabled**. The browser sends no captcha token, so an enabled CAPTCHA rejects every sign-in with `captcha protection: request disallowed`.

Supabase issues and refreshes the JWT; this app never creates its own JWT. It verifies user JWTs using the Supabase JWKS URL and rejects any token with `is_anonymous`. The `kid` shown in the JWKS response is only a key identifier, not a secret.

## 3. Configure Vercel Environment

Add these variables in Vercel Project Settings:

```text
DATABASE_URL=<Supabase transaction pooler connection string>
SUPABASE_DB_CA_CERT=<absolute path to Supabase root CA cert on the server>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key>
APP_ORIGIN=https://sih.saireddy.dev
```

Teams are created at runtime, so there are no shared group secrets to configure. The refresh token is opaque, stored in a secure HTTP-only cookie, hashed in Postgres, and replaced after every refresh. Keep any `service_role` or `sb_secret_*` key out of the browser, GitHub, and public Vercel variables.

Production now refuses to connect to Postgres without a verified CA. Set either `SUPABASE_DB_CA_CERT` to a readable certificate path or `SUPABASE_DB_CA_CERT_PEM` to the PEM contents.

## 4. Deploy to Vercel

1. Push the project without `.env` and `ps.json`.
2. Import the repository into Vercel.
3. Add all variables above to Production and Preview environments as needed.
4. Deploy and connect the custom domain.
5. Set `APP_ORIGIN=https://sih.saireddy.dev`, then redeploy.

## 5. Put Cloudflare in Front

Proxy the domain through Cloudflare and set SSL/TLS mode to **Full (strict)**. Add WAF rate-limit rules at minimum:

| Endpoint | Suggested limit | Action |
| --- | ---: | --- |
| `POST /api/auth` | 10 requests/IP/10 minutes | Managed Challenge |
| `POST /api/team` | 5 requests/IP/15 minutes | Block for 1 hour |
| `GET /api/problems/*` | 60 requests/IP/minute | Managed Challenge |
| `POST /api/comments*` | 10 requests/IP/minute | Block for 10 minutes |

Also enable Cloudflare Bot Fight Mode. Every route additionally rate-limits per account in Postgres, so changing IP alone does not bypass the limits.

## Routes

| Path | View |
| --- | --- |
| `/` | Login gate when signed out, statement list when signed in |
| `/problem-statements/SIH26011` | The complete problem statement |

`vercel.json` rewrites `/problem-statements/*` to the app shell. A signed-out visitor opening a statement URL directly sees the login screen; after signing in, that statement opens rather than the bare list.

## Filters

The browser supports server-side search and filtering by theme, organization, category, dataset availability, starred items, hidden rejected items, and serial-number range. Search accepts both full PS ids like `SIH26011` and numeric forms like `26011`.

## Problem Statement Views

Cards show a two-line preview, clamped with `-webkit-line-clamp`. The whole card is a link — click the title, the description, anywhere on the card, or **Read full statement →**, or focus it and press Enter.

The full view is a page, not a modal, so nothing constrains its height. It renders the decoded summary, why it matters, background, the verbatim official description, expected-solution bullets, pain points, competitive landscape, the 36-hour build plan, evaluator questions, the evaluation scorecard, SWOT, the dataset link, your personal review state, private notes, team votes, and team notes. Long descriptions keep their paragraphs and lettered lists via `white-space: pre-wrap` rather than injected markup. `scripts/test-team.js` asserts that no `.detail-*` rule introduces `line-clamp`, `overflow: hidden`, or a `max-height`.

## Teams, Notes, Reviews, and Compare

Once signed in, the team dialog offers two actions:

- **Create team** — team name, team password, and team lead name. The name must be unique across the deployment (case-insensitive); the password is salted and scrypt-hashed. The creator is seated first and flagged as the team lead.
- **Join team** — the same team name and password, plus the member's own name, shown beside their team notes.

A team holds **6 members including the team lead**, so 5 more can join after the lead. The dialog lists the roster with a **Team Lead** badge, shows `4 / 6 Members`, and displays *"Team is full — maximum 6 members allowed."* once full. A member belongs to one team at a time and can leave to switch.

Seats are numbered 1 to 6 and a joiner takes the **lowest free** seat, so a seat given up by someone who left is reused rather than lost. When the lead leaves, the remaining member with the lowest seat inherits the role (the team is never leaderless); when the last member leaves, the team row is deleted rather than left behind as an empty team someone could join.

Team notes are stored per team id and visible to that team only. Deleting a team cascades its memberships but leaves its historical team notes in Postgres under the old team id.

Each signed-in user also has a private per-problem review state stored server-side:

- reading: `to read` or `read`
- decision: `keep`, `accept`, or `reject`
- private note: up to 4000 characters

Team members can also vote `yes`, `maybe`, or `no` on each problem statement. The detail page shows team vote totals.

The list page includes:

- review badges on cards
- a summary bar for accepted / keep / rejected / to-read / read counts
- a review board grouped by status
- compare selection for up to 4 problem statements
- markdown export of the current review board

## Running It Locally

```bash
npm install
node --env-file=.env scripts/dev.js     # http://localhost:3000
```

`scripts/dev.js` serves the static files and routes `/api/*` to the same handlers Vercel runs, including the `/problem-statements/:id` rewrite, and logs every API request with its status. It adds `http://localhost:3000` to `APP_ORIGIN` for the duration of the process so the origin check passes.

Run the offline checks with:

```bash
node scripts/test-team.js
node scripts/checks/guards.mjs
BASE_URL=http://localhost:3000 node --env-file=.env scripts/checks/e2e-flow.mjs
```

## Resilience Notes

Supabase's shared transaction pooler intermittently drops a connection while the pool is still opening it. Three deliberate choices keep that from logging people out:

- `lib/db.js` retries once when a query fails before reaching the server (no SQLSTATE `code` and a `Connection terminated` message). A real SQL error always carries a code and is never retried.
- `verifyAccess` only returns `null` for a missing, malformed, or expired token. A database failure is allowed to throw, so the client sees a 500 and keeps its session instead of being told it is signed out.
- `rotateSession` sends the new refresh cookie to the browser *before* writing to Postgres. Supabase invalidates the old token the moment it issues a new one, so persisting the cookie last would strand the session permanently whenever that write failed.

On the client, only a `401` from `/api/session/refresh` sends the user back to the login screen; any other failure is retried once and then reported without dropping the session.
