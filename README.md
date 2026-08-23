# SIH Selection Desk

A Vercel-hosted SIH problem-statement browser with Supabase anonymous Auth JWTs, rotating Supabase refresh tokens, server-side filtering, pagination, Supabase Postgres storage, and private per-team comments.

## Security Boundary

`ps.json` must not be deployed or committed. It is used once from your local machine to import the statements into Supabase Postgres. Browsers can only request:

- 12 summary records per list request
- One complete statement per detail request
- At most 60 distinct complete statements per seven-day browsing session
- Comments belonging to the joined team

This slows and detects bulk collection but cannot make publicly displayed information impossible to copy. Cloudflare rate limits and bot management are still required in front of Vercel.

**Turnstile is no longer used.** Anyone can call `POST /api/session` and mint a fresh anonymous session, and each new session gets its own 60-statement budget, so the per-session limits above no longer bound a determined scraper. The Cloudflare WAF rules in section 4 are now the only thing rate-limiting session creation — treat them as required, not optional. Re-enable CAPTCHA in **Supabase -> Authentication -> Bot and Abuse Protection** to restore the original boundary.

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

1. In Supabase Dashboard, open **Authentication -> Providers** and enable **Anonymous Sign-Ins**.
2. In **Authentication -> Bot and Abuse Protection**, leave CAPTCHA protection **disabled**. The browser sends no captcha token, so an enabled CAPTCHA rejects every sign-in with `captcha protection: request disallowed`.

Supabase issues and refreshes the JWT; this app never creates its own JWT. It verifies user JWTs using the Supabase JWKS URL. The `kid` shown in the JWKS response is only a key identifier, not a secret.

## 3. Configure Vercel Environment

Add these variables in Vercel Project Settings:

```text
DATABASE_URL=<Supabase transaction pooler connection string>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key>
APP_ORIGIN=https://sih.saireddy.dev
```

Teams are created at runtime, so there are no shared group secrets to configure. The refresh token is opaque, stored in a secure HTTP-only cookie, hashed in Postgres, and replaced after every refresh. Keep any `service_role` or `sb_secret_*` key out of the browser, GitHub, and public Vercel variables.

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
| `POST /api/session` | 10 requests/IP/10 minutes | Managed Challenge |
| `POST /api/team` | 5 requests/IP/15 minutes | Block for 1 hour |
| `GET /api/problems/*` | 60 requests/IP/minute | Managed Challenge |
| `POST /api/comments*` | 10 requests/IP/minute | Block for 10 minutes |

Also enable Cloudflare Bot Fight Mode. The application separately limits requests by browsing session in Postgres, but with Turnstile removed a caller can mint new sessions freely, so the `POST /api/session` rule above is what actually caps that.

## Filters

The browser supports server-side search and filtering by theme, organization, category, effort, innovation, verdict, and serial-number range. Enter `10` and `20` under **From PS no.** and **To PS no.** to show statements 10 through 20, then select **Yellow** to limit that range to yellow verdicts.

## Teams and Comments

Once a session opens, the team dialog offers two actions:

- **Create team** — team name, team password, and team leader name. The name must be unique across the deployment (case-insensitive); the password is salted and scrypt-hashed in the `teams` table. The creator takes the first seat.
- **Join team** — the same team name and password, plus the member's own name, which appears beside their comments.

A team holds at most **6 members**. Membership is the set of live `browse_sessions` rows whose `group_key` is the team id, so a member's seat is released when their seven-day session expires, and joining a different team frees the old seat automatically. Closing the dialog is allowed: browsing works solo, only comments require a team.

Comments are stored per team id, so they stay visible to that team only. Deleting a team's row does not delete its comments; they remain in Postgres under the old team id.
