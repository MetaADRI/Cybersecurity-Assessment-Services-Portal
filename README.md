# OpenDefenders Cybersecurity Management Platform (ODCMP)

An integrated, database-backed web application for **OpenDefenders Technologies** (Lusaka, Zambia) that combines three systems in one product:

1. **Cybersecurity Health Score and Assessment System** — assess security controls, calculate a transparent, reproducible health score with visible coverage, and track scores over time.
2. **Vulnerability Remediation Tracking System** — record findings, prioritise them with a documented decision matrix, run a governed remediation lifecycle, and import/export findings via CSV.
3. **Cybersecurity Report Generation System** — generate executive, technical and remediation **PDF reports** from real stored application data.

All three modules share one Postgres database (Neon in deployment): the same customers, assessments, findings, scores, snapshots and audit history flow through the whole product. There is **no AI and no paid service** anywhere in the scoring, prioritisation, recommendation or reporting pipeline — every calculation is deterministic code with automated tests.

> **MVP status.** This release is intended for local demonstration and controlled internal evaluation. It is _not_ approved for production use or for storing real client data as-is — see [`docs/security-notes.md`](docs/security-notes.md).

---

## Technology stack

| Layer    | Choice                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------- |
| Frontend | React 19, TypeScript (strict), Vite, Tailwind CSS 4, React Router 7, Recharts, Lucide React, React Hook Form + Zod     |
| Backend  | Node.js, Express 4, TypeScript, Zod request validation, typed service/repository layers                                |
| Database | PostgreSQL (Neon) via `pg`, versioned migrations, foreign keys, transactions                                            |
| Auth     | Server-side sessions in `httpOnly` cookies, bcrypt password hashes, CSRF double-submit token, role-based authorization |
| Reports  | `pdfkit` PDF generation from persisted records                                                                         |
| Testing  | Vitest + React Testing Library + Supertest, Playwright (system Chrome) for end-to-end                                  |
| Quality  | ESLint 9, Prettier, `tsc --noEmit`, Zod-validated environment variables                                                |

---

## Prerequisites

- **Node.js 20+** (Node 22 recommended).
- npm.
- A PostgreSQL connection string (local Postgres or a Neon database). `bcryptjs` is pure JavaScript; no native build step is required.
- For browser end-to-end tests only: an installed **Google Chrome** (the Playwright config uses `channel: 'chrome'`, so no browser download is needed).

## Installation

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
```

Then edit `.env` and set at minimum a strong `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`.env.example` documents every variable. `.env`, local database files and generated reports are git-ignored — never commit them.

## Environment configuration

| Variable                                       | Default                 | Purpose                                     |
| ---------------------------------------------- | ----------------------- | ------------------------------------------- |
| `PORT`                                         | `4000`                  | API server port                             |
| `DATABASE_URL`                                 | _(required)_            | PostgreSQL / Neon connection string          |
| `DATABASE_URL_TEST`                            | —                       | Separate Postgres database used by tests; use Neon's unpooled host so test schemas stay isolated |
| `SESSION_SECRET`                               | _(required, ≥16 chars)_ | Signs session cookies                       |
| `SESSION_TTL_HOURS`                            | `12`                    | Session lifetime                            |
| `CORS_ORIGINS`                                 | `http://localhost:5173` | Allowed browser origins (comma separated)   |
| `REPORTS_DIR`                                  | `./reports/generated`   | Where PDFs are written (project-local only) |
| `TZ_DISPLAY`                                   | `Africa/Lusaka`         | Display timezone for timestamps             |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_AUTH_MAX` | `60000` / `20`          | Auth endpoint rate limit                    |
| `LOG_LEVEL`                                    | `info`                  | `debug` \| `info` \| `warn` \| `error`      |
| `ODCMP_ADMIN_EMAIL` / `ODCMP_ADMIN_PASSWORD`   | —                       | Only read by `npm run db:bootstrap`         |

The environment is parsed with Zod at startup; invalid configuration fails fast with a clear message instead of starting a half-configured server.

## Database initialisation

```bash
npm run db:migrate     # applies pending migrations + default categories/controls
```

Migrations are versioned and recorded in a `schema_migrations` table, so re-running is safe. Foreign keys, uniqueness constraints and indexes are declared in the schema.

## Administrator bootstrap

No credentials are hardcoded anywhere. Create the first administrator by supplying the password through the environment (it is never printed or logged):

```bash
ODCMP_ADMIN_EMAIL=admin@opendefenders.test ODCMP_ADMIN_PASSWORD="choose-a-strong-password" npm run db:bootstrap
```

The password must be at least 10 characters. If users already exist, the script does nothing. Additional users (analysts, read-only reviewers) are created from the **Users** page by an administrator.

## Loading demonstration data

```bash
npm run db:seed -- --replace
```

This loads **clearly fictional** data (three organisations from different sectors, four assessments with different coverage — including one below the scoring threshold, ten findings across every severity and status, remediation activity and history). All demo records carry `(Demo)` names and are labelled as demonstration data in the UI. `--replace` removes and reloads _only_ the demo records; without the flag the seeder refuses to run twice.

The seeder never runs implicitly — demonstration data cannot appear in a deployment by accident.

## Development commands

```bash
npm run dev          # API (tsx watch, :4000) + Vite dev server (:5173) together
npm run dev:server   # API only
npm run dev:client   # frontend only
```

Open <http://localhost:5173> (Vite proxies `/api` to the API server).

## Testing

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit (strict, whole repo)
npm run format:check # Prettier
npm run test         # Vitest: unit + API integration + frontend tests
npm run test:e2e     # Playwright: real browser journeys against a dedicated DB/port
```

See [`docs/testing.md`](docs/testing.md) for what each suite covers.

## Production build and run

```bash
npm run build        # client -> dist/client, server -> dist-server/main.js
npm start            # serves the API and the built SPA from one process
```

`npm start` reads `PORT` from the environment (default `4000`) and serves the built frontend with an SPA fallback.

## Deployment (Neon + Render + Cloudflare Pages)

The API and frontend are deployed separately. Both talk to the same Neon Postgres database.

1. **Neon** — create a project and database. Copy the pooled connection string (`postgresql://…?sslmode=require`). Create a second, empty database for tests if you plan to run the suite against Postgres.
2. **Render** — create a new **Blueprint** from `render.yaml`, or a Web Service with build command `npm install && npm run build` and start command `npm start`. Set `DATABASE_URL` to the Neon connection string and `CORS_ORIGINS` to the Cloudflare Pages origin (e.g. `https://your-site.pages.dev`). Migrations and default configuration run automatically on startup.
3. **Cloudflare Pages/Workers** — connect the GitHub repository, set the build command to `npm run build:client`, the output directory to `dist/client`, and add build variable `VITE_API_URL` set to the Render service URL (no trailing slash). `wrangler.jsonc` provides SPA route fallback for Workers deployments; standard Pages deployments can add a `/* /index.html 200` `_redirects` rule if needed.
4. Bootstrap the first administrator by running `npm run db:bootstrap` locally with `DATABASE_URL` pointing at the same Neon database, supplying `ODCMP_ADMIN_EMAIL` and `ODCMP_ADMIN_PASSWORD` in the environment.

Cookies use `SameSite=None; Secure` in production so browser sessions work across the Cloudflare Pages and Render origins. Keep `SESSION_SECRET` stable across deploys; changing it invalidates all sessions.

## Common troubleshooting

| Symptom                                                | Fix                                                                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Invalid environment configuration: SESSION_SECRET...` | Copy `.env.example` to `.env` and set a long `SESSION_SECRET`.                                                                          |
| `SQLITE_CANTOPEN`                                      | Create the data directory (`mkdir -p data`) or check `DATABASE_URL`.                                                                    |
| Login fails with a generic error                       | The account must be created by `npm run db:bootstrap` or an administrator on the Users page.                                            |
| Port already in use                                    | Change `PORT` (and `CORS_ORIGINS`/Vite proxy if you run `npm run dev`).                                                                 |
| Stale dev server after a schema change                 | Stop the server, re-run `npm run db:migrate`, restart.                                                                                  |
| `test:e2e` cannot reach Chrome                         | Install Google Chrome, or change `channel: 'chrome'` in `playwright.config.ts` to `chromium` and run `npx playwright install chromium`. |
| Demo data mixed with real records                      | `npm run db:seed -- --replace` reloads demo records only; `npm run db:reset` rebuilds the database from scratch (destructive).          |

## Known limitations

- Single-tenant: there is no per-customer data partitioning between tenants; authorization is role-based (admin / analyst / read-only reviewer), not organisation-scoped.
- CSV import is **generic**, not scanner-specific (no Nmap/OpenVAS integration, by design and by policy — no automatic scanning or network activity).
- Reports are generated synchronously and stored on local disk; there is no report retention/rotation policy yet.
- The audit log is application-level and **not tamper-proof** — a database administrator can modify it.
- See [`docs/security-notes.md`](docs/security-notes.md) for the full pre-production checklist.

## Documentation

| Document                                                     | Contents                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| [`BUILD_PLAN.md`](BUILD_PLAN.md)                             | Implementation checklist with completion status                  |
| [`docs/architecture.md`](docs/architecture.md)               | Components, data model, API, data flow between the three modules |
| [`docs/scoring-methodology.md`](docs/scoring-methodology.md) | Weights, rubric, coverage, eligibility, rounding, versioning     |
| [`docs/user-guide.md`](docs/user-guide.md)                   | Analyst workflows end to end                                     |
| [`docs/security-notes.md`](docs/security-notes.md)           | Security controls implemented and what is still missing          |
| [`docs/testing.md`](docs/testing.md)                         | Test suites and how to run them                                  |
