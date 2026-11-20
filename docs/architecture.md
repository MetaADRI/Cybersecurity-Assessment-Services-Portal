# Architecture

ODCMP is a **modular monolith**: one Express process serving a versioned JSON API and the built React single-page application, backed by one SQLite database. There are no microservices, queues or external providers — every business calculation runs in-process and is deterministic.

```
client/            React SPA (Vite build -> dist/client)
  src/
    components/    Reusable UI (Layout, PageHeader, tables, fields, badges)
    pages/         One file per screen (Login, Dashboard, Customers, Assessments,
                   HealthScores, ScoreHistory, Findings, RemediationBoard,
                   CsvImport, Reports, ReportPreview, Settings, Users, AuditLog)
    hooks/         useApi (fetch wrapper: loading/error/CSRF handling)
    lib/           api client, formatting, zodResolver, report types
    auth.tsx       Session context + route guards
shared/            Code imported by BOTH sides — the single source of truth
  constants.ts     Roles, statuses, severities, transitions, rubric, labels
  schemas.ts       Zod schemas for every request body
  types.ts         DTO interfaces (ScoreResult, CategoryScore, ...)
server/src/
  app.ts           Express app: helmet, CORS, rate limits, CSRF, routers
  main.ts          Entry point: env validation, DB open, listen
  routes/          HTTP layer — validation, status codes, authorization gates
  services/        Business logic (scoring config, reports, import, dashboard)
  scoring/         Pure scoring engine, priority matrix, recommendations
  repositories/    Data access — parameterized SQL only, no business rules
  middleware/      Session, CSRF/origin guard, roles, async error handler
  database/        Migrations, defaults, seeder, CLI scripts
  reports/         Report content builder + pdfkit renderer
  security/        Password hashing
  config/env.ts    Zod-validated environment (.env loader included)
tests/
  unit/            Pure-logic tests (scoring, priority, recommendations, csv)
  integration/     Supertest API tests + React Testing Library page tests
  e2e/             Playwright browser journeys
docs/              This documentation set
```

## Layering rules

1. **Routes** validate (Zod), authorize (role middleware) and translate to status codes. They never write SQL.
2. **Services** implement business workflows and transactions (e.g. freezing a score snapshot on completion, committing a CSV import atomically).
3. **Repositories** own all SQL, always parameterized. No string concatenation of user input into queries anywhere.
4. **Scoring** (`server/src/scoring/`) is pure: plain data in, `ScoreResult` out. It imports nothing from Express, SQLite or React, so it is exhaustively unit-testable and is also the _only_ place a health score is ever computed — the API, the dashboard and the PDF renderer all consume the same result object.

## Data model

```
users ──< sessions
users ──< audit_events (actor)
customers ──< assessments ──< control_assessments >── security_controls ──> security_categories
customers ──< findings ──< finding_status_history
                │      └──< remediation_activities
                └── risk_acceptances
assessments ──< reports
scoring_methodologies (versioned snapshots of weights/rubric/threshold)
app_settings, sequences (key-value config and human-readable id counters)
```

Key tables and their role:

| Table                                      | Purpose                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`, `sessions`                        | Accounts (bcrypt hash, role) and server-side sessions                                                                                            |
| `customers`                                | Organisations; `status = active \| archived` (archival preserves history)                                                                        |
| `security_categories`, `security_controls` | Configurable category weights and the control library (key, guidance, rubric, weight, active flag)                                               |
| `scoring_methodologies`                    | Immutable per-version record of weights, rubric and coverage threshold                                                                           |
| `assessments`                              | Header, scope, status (`draft \| in_progress \| completed \| archived`), `methodology_version`, and the frozen score snapshot once completed     |
| `control_assessments`                      | Per-control status, score, evidence notes, justification (unique per assessment+control)                                                         |
| `findings`                                 | Severity, priority (+source and override justification), exploitability/exposure/impact, status, assignee, dates, resolution/verification fields |
| `finding_status_history`                   | Append-only trail of every status change with actor and note                                                                                     |
| `remediation_activities`                   | Progress notes / evidence / proposed fix / verification records                                                                                  |
| `risk_acceptances`                         | Justification, decision maker, approval timestamp, review date                                                                                   |
| `reports`                                  | Report metadata incl. the assessment snapshot version referenced                                                                                 |
| `audit_events`                             | Actor, action, entity type/id, timestamp, human summary                                                                                          |
| `app_settings`                             | Scoring configuration, coverage threshold, methodology version                                                                                   |

Identifiers are UUIDs (`newId()`); human-readable keys (`CUS-0001`, `ASM-0004`, `FND-0007`) come from the `sequences` table. Timestamps are stored as ISO-8601 UTC strings and displayed in `TZ_DISPLAY` (default **Africa/Lusaka**). Scores are rounded to one decimal place with a single documented rounding helper — no floating-point equality is used for validation (weights are validated as integers summing to 100).

**Deletion policy:** customers are archived, not deleted; assessments, findings, reports and audit events are never cascade-deleted. Historical snapshots survive configuration changes and customer archival.

## API

All endpoints live under **`/api/v1`**, return JSON, and use consistent error envelopes: `{ "error": { "code": "...", "message": "...", "details": [...] } }` with proper status codes (400 validation, 401 unauthenticated, 403 forbidden/CSRF, 404 unknown id, 409 conflict, 422 business-rule violation, 429 rate limited).

| Area        | Endpoints (selected)                                                                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth        | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`                                                                                                                     |
| Users       | `GET/POST /users`, `PATCH /users/:id` (admin only)                                                                                                                                                        |
| Customers   | `GET/POST /customers`, `GET/PATCH /customers/:id`, `POST /customers/:id/archive                                                                                                                           | restore`, `GET /customers/:id/assessments | findings` |
| Assessments | `GET/POST /assessments`, `GET/PATCH /assessments/:id`, `POST /assessments/:id/controls/:controlId`, `GET /assessments/:id/score`, `GET /assessments/:id/recommendations`, `POST /assessments/:id/complete | reopen`, `GET /assessments/:id/history`   |
| Findings    | `GET/POST /findings`, `GET /findings/export`, `GET/PATCH /findings/:id`, `POST /findings/:id/status`, `POST /findings/:id/activities`, `GET /findings/:id/history`                                        |
| CSV         | `GET /findings/template`, `POST /findings/preview`, `POST /findings/commit`                                                                                                                               |
| Reports     | `GET /reports`, `POST /reports/preview`, `POST /reports/generate`, `GET /reports/:id/download`                                                                                                            |
| Dashboard   | `GET /dashboard/summary`                                                                                                                                                                                  |
| Settings    | `GET/PUT /settings/scoring`, `GET /settings/controls`, `PATCH /settings/controls/:id`, `GET /settings/audit`                                                                                              |

Collections that can grow (customers, assessments, findings, reports, audit) support `page`/`pageSize` pagination plus filters (status, severity, customer, assignee, search, date ranges). Responses never include password hashes, session tokens or other users' private data.

## Cross-module data flow

The three modules are one pipeline, not three CRUD screens:

1. **Customer** created → gets a `CUS-` key; archived customers keep all history.
2. **Assessment** created for the customer → seeded with every _active_ control from the library; analyst records status + evidence per control. Draft/in-progress assessments never publish a final score.
3. **Scoring engine** computes category scores, coverage and the overall score on demand (`GET /assessments/:id/score`). On **completion**, the result is validated against the coverage threshold, then frozen into the assessment row together with its `methodology_version`.
4. **Findings** link to the same customer _and_ assessment (validated server-side to belong to the same customer). Creating/updating a finding immediately changes dashboard counts and remediation views because they are all derived from the same table.
5. **Remediation** transitions are validated against `FINDING_TRANSITIONS`, require justification fields for accepted risk / false positive / resolution, and append to `finding_status_history` + `audit_events`.
6. **Score history** compares two frozen snapshots with `compareScores()`; it refuses to pretend improvement when the delta is caused by coverage, methodology or scope differences.
7. **Reports** read the frozen snapshot + current findings through `buildReportContent()`; the PDF renderer only formats that content. A PDF therefore can never show a different score from the one stored on the assessment.
8. **Customer detail** closes the loop: assessments, findings, remediation progress and score history for that customer in one view.

### Why a resolved finding does not raise a historical score

Control state and finding state are deliberately decoupled: a health score measures _control effectiveness recorded during an assessment_. Resolving a finding updates remediation metrics only. The score changes when — and only when — a new assessment (or a controlled reassessment) records the improved control state. Reopening an assessment for edits after completion is an explicit, audited action, and the original snapshot is preserved.

### Transactions

Multi-step writes are wrapped in Postgres transactions: assessment completion (score freeze + status + audit), CSV commit (all rows or none), status transitions (finding + history + audit), and report generation metadata + file write ordering.

## Frontend data flow

`useApi` hooks own loading/error state, attach the CSRF token to state-changing requests, and surface the structured API error messages. Forms use React Hook Form with the shared Zod schemas through a local resolver, so client and server validate with _identical_ rules — while the server remains the enforcement point. Route guards redirect unauthenticated users to `/login`; permission-dependent actions (e.g. edit buttons) are hidden for reviewers, but the API independently rejects their writes.
