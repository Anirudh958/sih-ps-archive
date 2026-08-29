# Contributing to SIH Selection Desk

Thanks for your interest in contributing.

## Getting set up

```bash
git clone https://github.com/Vigneshrdy/sih-ps.git
cd sih-ps
npm install
cp .env.example .env    # fill in your Supabase credentials
npm run dev             # http://localhost:3000
```

Ask a maintainer for the `ps.json` data file if you need a populated database,
then run `npm run import:data`.

## Development

```bash
npm run dev   # local server at http://localhost:3000
```

The dev server mimics the Vercel runtime and routes `/api/*` to the real
handlers in `api/`.

## Before opening a PR

All checks must pass:

```bash
npm run check     # offline checks
npm run check:e2e # end-to-end (needs the dev server running)
```

Run `git ls-files ps.json` — it must print nothing. `ps.json` must never be
committed or deployed.

## Code conventions

- Plain Node.js ESM, no build step, no framework. Keep it that way unless the
  change is impossible without one.
- Security boundaries live in the database schema and `lib/`, not in handlers.
  Team limits belong in `supabase/schema.sql` constraints, not handler checks.
- Match the surrounding style: comment *why*, not *what*.

## Pull request process

1. Fork the repo and create a feature branch (`git checkout -b feature/amazing`).
2. Make your change with checks passing.
3. Push to the branch and open a Pull Request against `main`.
4. Describe what changed and why; link any related issue.

## Reporting bugs

Open an [issue](https://github.com/Vigneshrdy/sih-ps/issues) with the exact
command or URL, expected behavior, and actual behavior. Never paste secrets,
`.env` contents, or `ps.json` data into an issue.
