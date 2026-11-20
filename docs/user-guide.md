# User guide

Written for a cybersecurity analyst at OpenDefenders Technologies using ODCMP day to day. Screens match the sidebar navigation.

---

## 1. Signing in

Accounts are created by an administrator (see README for the first-account bootstrap). Sign in at `/login`; sessions expire after `SESSION_TTL_HOURS` (default 12 hours) and passwords are stored only as salted bcrypt hashes.

Roles:

| Role                   | Can do                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **Administrator**      | Everything below, plus user management, scoring configuration, control-library maintenance, audit log |
| **Analyst**            | Customers, assessments, findings, remediation, CSV import/export, reports                             |
| **Read-only reviewer** | View permitted records and reports; every write is blocked by the server, not just hidden in the UI   |

## 2. Creating a customer

1. **Customers → New customer**.
2. Fill in organisation name, industry, contact person/email, and the assessment scope or environment description. Phone and description are optional.
3. Save. Validation runs on the form _and_ on the server; duplicate active customer names are rejected with a conflict message.
4. Refresh the page — the customer persists with its `CUS-####` key.

On the **customer detail** page you see the customer's assessments, outstanding findings, remediation progress, and health-score history in one place. **Archive customer** hides it from active lists while preserving every historical record; **Restore** brings it back. Archiving never deletes assessments, findings or audit events.

## 3. Running an assessment

1. **Assessments → New assessment**, choose the customer, title, type (baseline, periodic, targeted, reassessment, gap analysis), date, scope and assessor.
2. The assessment is created as a **Draft** with every active control from the library attached. Save and resume any time — drafts store partial work safely.
3. **Assessment detail → Control evaluation**: set each control to _Effective_, _Partially effective_, _Ineffective_, _Not assessed_ or _Not applicable_, and record evidence notes.
   - Marking a control **Not applicable requires a justification** — the server rejects it without one.
   - Leaving a control unassessed keeps it visible as remaining coverage; it is never treated as a pass.
4. Watch the live **score panel**: overall score (or _Provisional score_), category breakdown, coverage %, and eligibility reasons explaining exactly what still blocks a final score.
5. **Recommendations** are generated from your actual results (e.g. an ineffective MFA control, an open critical finding, untested backups) — each shows the triggering control or finding and suggested next steps.
6. **Complete** when eligibility conditions are met. If coverage is below the threshold (default 80%) the server refuses with the reasons, so missing data can never become a final score. Completion freezes the score snapshot and its methodology version.
7. Reopening a completed assessment is an explicit, audited action; the original snapshot stays intact.

## 4. Recording findings

**Findings → New finding** (or from an assessment). Link it to the customer and assessment — the server verifies the assessment belongs to that customer. Provide title, description, asset, severity (critical/high/medium/low/informational), evidence, discovery date, recommended remediation and optional CVE/reference.

**Priority** is calculated from a documented matrix (severity × exploitability × exposure × business impact × compensating controls) and marked _calculated_. You can override it only by supplying a justification, which is stored and shown as _manual_. Unknown factors stay `unknown` — the system never assumes a finding is exploitable without evidence.

## 5. Tracking remediation

Move findings through the lifecycle on the finding detail page:

```
Open → In progress → Pending verification → Resolved
                 ↘ Accepted risk / False positive (with authorisation fields)
```

- **Resolved** requires resolution notes or verification evidence — a status change alone is not remediation.
- **Pending verification** means the fix still needs confirmation by someone else.
- **Accepted risk** requires justification, a decision maker and an approval timestamp (optional review date).
- **False positive** requires a documented explanation.
- Every transition is appended to the finding's **change history** with actor, timestamp and note, and audited.
- **Remediation activities** hold progress notes, proposed fixes and verification results.
- The **Remediation board** shows the status columns; the findings list supports filters (customer, assessment, severity, status, assignee, dates, overdue), search, sorting and pagination.

## 6. CSV import and export

1. **CSV import / export → Download template** for the exact headers.
2. Upload a file → **Preview**: rows are validated (headers, types, required fields, unknown severities/statuses) and each error is reported _per row_. Nothing is written at this stage.
3. **Commit** imports the valid rows in a single transaction, with duplicate protection against existing findings. Invalid files import nothing.

Import applies the same authorization and validation rules as manual creation. It is a **bulk data-entry tool, not a vulnerability scan** — ODCMP never runs scanners or network discovery.

**Export** downloads the currently filtered findings as CSV (analyst role or above).

## 7. Viewing health scores and history

- **Health scores** shows each customer's latest score, coverage, severity mix and trend.
- **Score history** (from an assessment) compares two completed assessments: previous vs current score, absolute change, per-category changes, coverage change, and caveats — scope differences, methodology changes, ≥10-point coverage shifts, provisional scores, or a rise caused by _more_ unassessed categories. A comparison with caveats is flagged as not directly comparable.
- Completed snapshots are never overwritten, so past reports keep their meaning.

## 8. Generating reports

1. **Reports → Generate report**, pick the assessment and one of the three types:
   - **Executive Cybersecurity Assessment Report** — summary, score and interpretation, coverage, category results, critical/high findings, strengths/weaknesses, prioritised recommendations, remediation progress, outstanding risks, limitations and next steps.
   - **Technical Findings Report** — methodology, scope, control results, finding IDs, severity/priority, assets, evidence, remediation, verification status.
   - **Remediation Status Report** — findings by severity and status, overdue items, progress, resolved and pending-verification counts, accepted risks, items needing management attention.
2. **Preview** shows the main contents in the browser first.
3. **Generate** produces a branded PDF (headers/footers, page numbers, confidentiality label) and records it in **report history** with its identifier, generator and assessment snapshot reference.
4. **Download** serves the file.

Reports use only stored data: if an assessment has no findings, the report says so rather than filling in samples. Draft assessments cannot be reported. Generation failures return a clear error and never touch assessment data.

## 9. Administration

- **Settings → Scoring configuration**: category weights (must be whole numbers totalling 100), coverage threshold, rubric values. Changes apply to _future_ scoring only.
- **Settings → Control library**: enable/disable controls, adjust weights and guidance without touching source code.
- **Users**: create analysts/reviewers, change roles, deactivate accounts.
- **Audit log**: filterable record of security-relevant actions (actor, action, entity, timestamp, summary). Read-only for non-admins and not editable through the API.
