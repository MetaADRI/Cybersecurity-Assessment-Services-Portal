# BUILD PLAN — OpenDefenders Cybersecurity Management Platform

Status legend: `[x]` implemented and checked, `[~]` implemented with documented limitations, `[ ]` not required for the MVP / not done.

Last verified: 26 October 2026 — `npm run lint`, `npm run typecheck`, `npm run test` (102 tests), `npm run test:e2e` (6 tests) and `npm run build` all pass.

---

## Phase 1 — Foundation

- [x] Workspace inspection and stack decision (React + Vite + Express + SQLite, see README)
- [x] Project structure: `client/`, `server/`, `shared/`, `tests/`, `docs/`
- [x] Zod-validated environment configuration with `.env.example`
- [x] SQLite database, versioned migrations, foreign keys, indexes, transactions
- [x] Authentication: server-side sessions, bcrypt hashes, CSRF protection, rate limiting
- [x] Role model (admin / analyst / read-only reviewer) enforced **on the server**
- [x] Customer management (create, view, edit, archive/restore, assessments, findings)
- [x] Shared application layout: sidebar navigation, page header, tables, forms, empty/loading/error states

## Phase 2 — Assessment engine

- [x] Configurable security categories with default weights (25/20/20/15/10/10 = 100%)
- [x] Control library (23 controls across 6 categories) with guidance, rubric, evidence and weight fields
- [x] Administrator control-library maintenance through the Settings UI (no source edits)
- [x] Five control states: effective / partially effective / ineffective / not assessed / not applicable
- [x] Justification required for `not applicable`; missing data never becomes `effective`
- [x] Deterministic scoring engine (pure module, unit tested): category weighted means, normalized overall score, coverage, excluded categories
- [x] Score eligibility + configurable coverage threshold; provisional scores labelled until eligible
- [x] Completed assessments freeze a score snapshot + methodology version; later config changes do not rewrite history
- [x] Health Score dashboard (score, categories, coverage, open findings by severity, overdue, trends)
- [x] Score history and comparison with scope/coverage/methodology caveats
- [x] Rule-based recommendation engine linked to actual control results and findings

## Phase 3 — Remediation

- [x] Finding creation with customer + assessment linkage and full field set
- [x] Severity (critical → informational) distinct from priority (P1–P4)
- [x] Documented priority decision matrix (severity × exploitability × exposure × business impact × compensating controls)
- [x] Analyst priority override with recorded justification
- [x] Governed status lifecycle (`open → in_progress → pending_verification → resolved`, plus accepted risk / false positive with required authorisation fields)
- [x] Resolution requires notes or verification evidence; resolved/accepted/false-positive records are preserved, never deleted
- [x] Status history, progress activities, and audit events for severity/priority/owner/due-date/status changes
- [x] Remediation board (status columns) and filterable, sortable, paginated findings list
- [x] CSV import: downloadable template, header/type validation, preview, row-level errors, transactional commit, duplicate protection
- [x] CSV export for authorised users

## Phase 4 — Reporting

- [x] Executive, Technical and Remediation report types
- [x] PDF generation with `pdfkit` from persisted records: branding, headers/footers, page numbers, tables, section headings, confidentiality label
- [x] Report preview before download
- [x] Report history metadata (id, customer, assessment, type, timestamp, generated-by, snapshot reference)
- [x] Controlled storage under `REPORTS_DIR` with path-traversal protection on download
- [~] Report history retention: files are stored indefinitely on local disk; no rotation/expiration policy yet

## Phase 5 — Quality and delivery

- [x] Module integration: one workflow from customer → assessment → score → finding → remediation → report, verified end to end
- [x] Audit logging for auth, customer, assessment, scoring-config, finding, remediation, risk-acceptance, report and user events
- [x] Unit tests (scoring, priority, recommendations, CSV)
- [x] Backend integration tests (49 API tests covering acceptance workflows A–J)
- [x] Frontend tests (login and customer list interactions, validation, loading, empty states)
- [x] Browser end-to-end tests (6 Playwright journeys against an isolated database and port)
- [x] ESLint + Prettier + `tsc --noEmit` clean
- [x] Production build (client bundle + server bundle) verified, server serves the built SPA
- [x] Demonstration data seeder (3 organisations, 4 assessments, 10 findings, history)
- [x] Documentation: README, architecture, scoring methodology, user guide, security notes, testing
- [~] OpenAPI specification — API is documented narratively in `docs/architecture.md`; a machine-readable spec is future work
- [ ] Scanner-specific imports (Nmap/OpenVAS parsers) — explicitly out of scope; no automatic scanning is performed
- [ ] Multi-tenancy / per-customer data partitioning — not in the MVP, documented in security notes
