# Security notes

Scope: a **local MVP** for demonstration and controlled internal evaluation. It is deliberately not represented as production-ready or multi-tenant SaaS. Read this before entering any real client data.

---

## 1. Controls implemented

### Authentication

- Passwords hashed with **bcrypt** (cost 12, per-user salt) via `bcryptjs`; hashes never leave the repository layer and API responses never contain them.
- **Server-side sessions** stored in the `sessions` table, delivered in `httpOnly`, `SameSite=Lax`, `Path=/` cookies (`Secure` when served over HTTPS). Session ID rotates at login; logout deletes the session row.
- Login is rate-limited (`RATE_LIMIT_AUTH_MAX` attempts per window, default 20/min) and returns a **generic** error so account existence is not disclosed.
- Password change requires the current password; sessions are invalidated for other devices.
- **No default or hardcoded credentials.** The first administrator is created by `npm run db:bootstrap` with the password supplied through `ODCMP_ADMIN_PASSWORD`, which is never printed or logged (minimum 10 characters enforced).

### Authorization

- Three roles: `admin`, `analyst`, `reviewer`. Enforcement happens in **middleware on the server** for every state-changing route (`requireAuth`, role gates), so bypassing the UI does not bypass the rules.
- Read-only reviewers cannot create/update customers, assessments, findings, imports, scoring configuration or reports; analysts cannot manage users or roles.
- Known limitation: authorization is **role-based, not customer-scoped** — any authenticated analyst can access any customer record. There is no tenant partitioning (single-company deployment model).

### Transport/API hardening

- **CSRF**: double-submit token — state-changing requests must send the `X-CSRF-Token` header obtained from `GET /auth/me`; combined with `SameSite=Lax` cookies and an origin/referrer check.
- **CORS**: restricted to the origins in `CORS_ORIGINS` (default `http://localhost:5173`), credentials enabled; no wildcard.
- **Helmet** security headers (CSP, frameguard, nosniff, referrer policy, HSTS in production…).
- **Rate limiting** on authentication endpoints; sane body-size limits for JSON and CSV uploads.
- Zod validation of **every** request body, query parameter, path id and uploaded file — unknown/extra fields are stripped (mass-assignment protection).
- Consistent error envelope; stack traces and internal errors are logged server-side, clients receive a generic message.
- 404 handling for unknown API routes; unknown ids return `404`, business-rule violations `409`.

### Data layer

- **Parameterized queries only** (`pg` prepared statements; `?` placeholders are translated to `$n`) — no string-built SQL.
- Foreign keys and uniqueness constraints are declared in the schema (e.g. one control assessment per control per assessment, duplicate active customer names blocked); multi-step writes are wrapped in transactions.
- **Path traversal**: report file names are server-generated IDs; the download endpoint rejects any user-supplied path component (covered by a test).
- CSV import: header/type validation, row-level error reporting, transactional commit (all-or-nothing), duplicate detection, size limits. The importer never executes or interprets file content beyond parsing fields.
- No automatic scanning, no outbound network activity, no third-party/AI services.

### Logging and audit

- Structured logs with a configurable level; **passwords, session tokens and secrets are never logged**, and audit summaries contain only identifiers and non-sensitive descriptions.
- Audit events cover login/logout, customer create/archive, assessment create/complete, scoring-config changes, finding create/update, severity/priority/assignment/due-date/status changes, risk acceptance, resolution/verification, report generation, and user/role changes.
- Audit records are append-only through the API — ordinary users have no endpoint that writes or mutates them. **They are not tamper-proof**: anyone with direct database access or a database backup can modify them.

### Configuration

- `.env` loader with Zod validation and fail-fast startup; `.env.example` contains placeholders only.
- `.env`, `*.db*` and generated reports are **git-ignored**.
- `REPORTS_DIR` is fixed by configuration; no user-controlled filesystem paths are accepted anywhere.

## 2. Limitations (must be fixed before real customer data)

1. **No tenant isolation.** Single-organisation deployment; do not host multiple clients' data with untrusted analyst separation expectations.
2. **Audit log is not tamper-proof** and there is no log shipping/off-site copy.
3. **No password complexity policy beyond minimum length**, no account lockout (only rate limiting), no MFA for the application itself.
4. **Sessions are file/database-backed on one node**; no revocation of all sessions on password change beyond the current logic, no idle-timeout UI warning.
5. **HTTPS is not terminated by the app** — run it behind a TLS-terminating reverse proxy; `Secure` cookies only take effect over HTTPS.
6. **No CSP nonces/hashes for the SPA** — the default Helmet CSP may need tuning; report PDFs are served with `Content-Disposition: attachment`.
7. **Backup/restore and encryption at rest are not implemented** — the app does not add its own encryption at rest; protect the database and back up manually.
8. **No data-retention policy** for report files or audit events.
9. **Dependency and vulnerability scanning** is not automated in CI.
10. **No automated security tests** beyond the authorization/CSRF/path-traversal integration tests; no penetration test has been performed.

## 3. Before using real customer data — checklist

- [ ] Terminate TLS in front of the app; set `CORS_ORIGINS` to the real origin only.
- [ ] Generate a strong unique `SESSION_SECRET`; keep `.env` out of version control and off shared drives.
- [ ] Run on a dedicated, patched host with filesystem encryption and off-site database backups.
- [ ] Create per-person accounts (never share the bootstrap admin), remove demo data (`npm run db:reset`, then re-migrate without seeding).
- [ ] Review role grants; confirm reviewers only need read access.
- [ ] Agree on retention/deletion rules for reports, findings evidence and audit events.
- [ ] Get explicit client authorisation before storing their data, and keep assessment evidence free of unnecessary personal information.
- [ ] Schedule dependency updates and a penetration test.

## 4. Reporting a problem

Document suspected issues privately to the project maintainer with reproduction steps; do not include real client data or live credentials in a report.
