# SIH Selection Desk

A Vercel-hosted SIH problem-statement browser with Cloudflare Turnstile, short-lived access tokens, rotating refresh tokens, server-side filtering, pagination, Supabase Postgres storage, and private group comments.

## Security Boundary

`ps.json` must not be deployed or committed. It is used once from your local machine to import the statements into Supabase Postgres. Browsers can only request:

- 12 summary records per list request
- One complete statement per detail request
- At most 60 distinct complete statements per seven-day browsing session
- Comments belonging to the joined group

This slows and detects bulk collection but cannot make publicly displayed information impossible to copy. Cloudflare rate limits and bot management are still required in front of Vercel.

Both `.gitignore` and `.vercelignore` exclude `ps.json` as defense in depth. Before every deployment, verify it is absent with `git ls-files ps.json` (the command should print nothing).

## 1. Create Private Storage

1. Open your Supabase project and run [`supabase/schema.sql`](/home/vignesh/sih/supabase/schema.sql) in **SQL Editor**.
2. In **Project Settings -> Database**, copy the **Transaction pooler** connection string, which uses port `6543`.
3. Install dependencies with `npm install`.
4. Create a local `.env` from `.env.example` and set `DATABASE_URL`.
5. Keep `ps.json` in this directory locally. It is already excluded by `.gitignore`.
6. Run `npm run import:data`.

The import creates the schema and uploads all records as private Postgres rows. After a successful import, `ps.json` is not needed by Vercel.

The publishable/anonymous key and JWKS verification key are not used by this server. Keep any `service_role` key out of the browser, GitHub, and public Vercel variables. Only the private `DATABASE_URL` belongs in Vercel server environment variables.

## 2. Configure Turnstile

1. In Cloudflare Dashboard, open **Turnstile** and create a widget.
2. Add the production hostname and `localhost` for local testing.
3. Use **Managed** widget mode.
4. Copy the site key and secret key.

Add these Vercel environment variables:

```text
TURNSTILE_SITE_KEY=<public site key>
TURNSTILE_SECRET_KEY=<secret key>
TURNSTILE_HOSTNAME=<production hostname>
```

The site key is intentionally returned to the browser. The secret key remains inside Vercel functions and verifies each Turnstile token with Cloudflare before a session is issued.

## 3. Configure Sessions and Group

Generate independent secrets locally:

```bash
openssl rand -base64 48
```

Add these variables in Vercel Project Settings:

```text
DATABASE_URL=<Supabase transaction pooler connection string>
SESSION_SECRET=<random value, at least 32 characters>
APP_ORIGIN=https://your-domain.example
GROUP_TOKEN=<random group token shared with members>
GROUP_PASSWORD=<separate strong password shared with members>
```

Do not use the group token as its password. A successful join adds a hashed group identifier to the five-minute access token. The refresh token is opaque, stored in a secure HTTP-only cookie, hashed in Postgres, and replaced after every refresh.

## 4. Deploy to Vercel

1. Push the project without `.env` and `ps.json`.
2. Import the repository into Vercel.
3. Add all variables above to Production and Preview environments as needed.
4. Deploy and connect the custom domain.
5. Set `APP_ORIGIN` and `TURNSTILE_HOSTNAME` to the final hostname, then redeploy.

## 5. Put Cloudflare in Front

Proxy the domain through Cloudflare and set SSL/TLS mode to **Full (strict)**. Add WAF rate-limit rules at minimum:

| Endpoint | Suggested limit | Action |
| --- | ---: | --- |
| `POST /api/session` | 10 requests/IP/10 minutes | Managed Challenge |
| `POST /api/group/join` | 5 requests/IP/15 minutes | Block for 1 hour |
| `GET /api/problems/*` | 60 requests/IP/minute | Managed Challenge |
| `POST /api/comments*` | 10 requests/IP/minute | Block for 10 minutes |

Also enable Cloudflare Bot Fight Mode. The application separately limits requests by browsing session in Postgres, so changing IP alone does not bypass all limits.

## Filters

The browser supports server-side search and filtering by theme, organization, category, effort, innovation, verdict, and serial-number range. Enter `10` and `20` under **From PS no.** and **To PS no.** to show statements 10 through 20, then select **Yellow** to limit that range to yellow verdicts.

## Group Comments

This version provides one deployment-wide private group. Members select **Join group** and enter the configured token, password, and a display name. Comments are visible only to sessions carrying that group's signed membership claim.

Changing `GROUP_TOKEN` creates a different logical group. Existing comments remain in Postgres under the previous group's hashed identifier.
