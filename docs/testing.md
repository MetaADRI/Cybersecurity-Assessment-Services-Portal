# Testing

All suites run locally with no external services. **Last full run: 102 Vitest tests passed, 6 Playwright tests passed, lint / typecheck / build clean.**

| Command                | Suite          | Scope                                                              |
| ---------------------- | -------------- | ------------------------------------------------------------------ |
| `npm run lint`         | ESLint 9       | Whole repository (React, TypeScript, tests, scripts)               |
| `npm run typecheck`    | `tsc --noEmit` | Strict TypeScript across `client/`, `server/`, `shared/`, `tests/` |
| `npm run format:check` | Prettier       | Formatting of all committed files                                  |
| `npm run test`         | Vitest         | Unit + API integration + frontend tests (single run)               |
| `npm run test:watch`   | Vitest         | Watch mode for development                                         |
| `npm run test:e2e`     | Playwright     | Real browser journeys against an isolated database and port        |

## 1. Unit tests (`tests/unit/`)

Pure logic with no database or DOM:

- **`scoring.test.ts`** — the whole scoring contract: perfectly effective controls, completely ineffective controls, mixed and unequally weighted controls, missing (unassessed) controls, not-applicable exclusion, empty/unknown categories (never 0 or 100), invalid weight sets, coverage thresholds, rounding, zero eligible weight, frozen methodology versions, critical findings remaining visible with a high score, and comparisons across different coverage.
- **`priority.test.ts`** — the severity × exploitability × exposure × business-impact matrix, unknown-factor handling and manual override behaviour.
- **`recommendations.test.ts`** — deterministic rule triggers (only fires when a real control result or finding justifies it) plus CSV parse/serialise round-trips.

## 2. Backend integration tests (`tests/integration/api.test.ts`)

Supertest requests against the real Express app and an isolated Postgres schema, organised by the project's acceptance workflows:

- **Authentication/authorization** — unauthenticated access rejected, generic login errors, session + CSRF token issuance, missing CSRF token rejected, reviewer blocked from every write, analyst blocked from user management and scoring config.
- **Workflow A** — customer creation, validation, duplicate prevention, unknown ids.
- **Workflow B** — assessment creation with the full control library, missing data never becoming _effective_, required `not applicable` justification, a score matching an independent hand calculation, completion refused below the coverage threshold, snapshot frozen at completion, completed assessments immutable, weights validated to total 100, recommendations linked to recorded results.
- **Workflow C/D** — finding linkage and cross-customer validation, dashboard counts, lifecycle transitions with history, resolution requiring evidence, invalid/duplicate transitions rejected, risk acceptance fields, priority recalculation and justified override, reviewer write denial.
- **Workflow E** — score history comparison without overwriting the earlier snapshot.
- **Workflow F** — report preview, executive/technical/remediation PDFs containing real data, download, path-traversal rejection, drafts not reportable.
- **Workflow G** — CSV missing-column and row-level errors importing nothing, transactional import with duplicate protection, reviewer denial, CSV export.
- **Workflows I/J** — persistence across a database reopen, structured validation errors, 404 for unknown routes, auth required against an empty database, password hashes never exposed.

## 3. Frontend tests (`tests/integration/client/`)

React Testing Library with a mocked API layer:

- **`login.test.tsx`** — empty-form validation, server error display for bad credentials, successful submit + redirect, disabled submit while in flight.
- **`customers.test.tsx`** — customer list rendering, search query sent to the API, loading and empty states.

## 4. End-to-end tests (`tests/e2e/odcmp.spec.ts`)

`npm run test:e2e` first builds an **isolated database** (`./data/e2e.db`) with schema, control library, an `e2e-admin@example.com` account and demonstration data, then starts the production bundle (`node dist-server/main.js`) on port **4100** and drives system Chrome (`channel: 'chrome'`, so no browser download):

1. Invalid password produces a readable error.
2. Sign-in shows live dashboard figures with demonstration data labelled.
3. Creating a customer persists across a page reload (Workflow A).
4. Customer form validation appears before submit.
5. Opening a seeded in-progress assessment shows provisional scoring and coverage (Workflow B).
6. Remediation board shows the seeded status columns (Workflow D).

Fixtures are re-created on every run and never touch the development database.

## 5. Not automated / known gaps

- **PDF visual layout** is verified structurally (the tests parse the generated file for the expected customer, score, coverage and finding content) and by opening the file; there is no pixel-level rendering assertion.
- **Report preview rendering** is covered by API content tests, not by a dedicated browser test.
- **Performance/load testing** has not been performed — pagination and indexes are in place but unmeasured at scale.
- **Security testing** is limited to the authorization, CSRF and path-traversal integration tests; no scanner or penetration test has been run.

## 6. Writing new tests

- Put pure logic under `tests/unit/`, API behaviour in `tests/integration/api.test.ts`, UI behaviour in `tests/integration/client/`, user journeys in `tests/e2e/`.
- Tests must assert real behaviour. If a test fails, fix the code — never weaken the assertion or delete the test to get a green run.
