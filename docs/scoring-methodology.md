# Scoring methodology

Methodology **version 1**. Implemented in `server/src/scoring/engine.ts` (pure functions, no I/O) and unit-tested in `tests/unit/scoring.test.ts`.

A health score is a **risk-management indicator**, not proof that an organisation is secure. Every score must be read together with its coverage figure and any critical findings.

---

## 1. Category weights

| #   | Category                               | Default weight |
| --- | -------------------------------------- | -------------- |
| 1   | Vulnerability Management               | 25%            |
| 2   | Identity and Access Management         | 20%            |
| 3   | Endpoint Security                      | 20%            |
| 4   | Cloud and Network Security             | 15%            |
| 5   | Security Awareness                     | 10%            |
| 6   | Incident Response and Backup Readiness | 10%            |
|     | **Total**                              | **100%**       |

Weights are stored in `app_settings`, editable by an **administrator** through _Settings → Scoring configuration_. Validation rules:

- whole numbers between 0 and 100;
- must total **100** (integer comparison — no floating-point equality);
- rejected with a clear message otherwise.

Changing weights updates _future_ scoring only. Completed assessments keep a frozen copy of the weights, rubric and threshold in `scoring_methodologies`, referenced by `assessments.methodology_version` — history is never silently recalculated.

## 2. Control scoring rubric

Statuses are stored separately from numeric scores:

| Status                | Score    | Counted in denominator?                          |
| --------------------- | -------- | ------------------------------------------------ |
| `effective`           | 100      | yes                                              |
| `partially_effective` | 50       | yes                                              |
| `ineffective`         | 0        | yes                                              |
| `not_assessed`        | _(none)_ | no — it is **unassessed coverage**               |
| `not_applicable`      | _(none)_ | no — excluded after a **required justification** |

The rubric values are defaults held in configuration and versioned with the methodology. They are illustrative defaults, not a certification standard.

Rules enforced by the engine and the API:

- A missing response is **never** `effective` and **never** counts as zero — it counts as _unassessed_.
- `not_assessed` is not interchangeable with `not_applicable`.
- `not_applicable` requires a justification string; without it the API returns a validation error.
- Every control carries a weight inside its category (from the control library).

## 3. Category score

```
Category score = Σ(control weight × control score)
                 ─────────────────────────────────────
                 Σ(weights of assessed, applicable controls)
```

- Not-applicable controls are removed from both numerator and denominator.
- Unassessed controls contribute nothing (they are not zeros).
- If **no** control in the category is both applicable and assessed, the category score is **`null` — unknown**. It is _not_ 0 and _not_ 100.

Rounding: one decimal place, applied with a single helper (`round1`, `Math.round(x·10)/10`) at each reported level.

## 4. Overall score

```
Overall score = Σ(category weight × category score)
                ─────────────────────────────────────
                Σ(weights of eligible categories)
```

A category is **eligible** when it has a known score _and_ a weight > 0. Categories with an unknown score are **excluded from the denominator** (they are reported in `excludedCategories` so their missing coverage stays visible) — they never drag the score down to 0, and never inflate it toward 100.

If no category is eligible, the overall score is `null` (displayed as _unavailable_), not 0.

## 5. Coverage

```
coverage % = assessed applicable controls ÷ applicable controls × 100   (1 decimal)
```

- `applicable = total controls − not applicable`.
- Coverage is reported **separately from the score**, always.
- An entirely unassessed category does not enter the score denominator, but it _does_ reduce coverage and is listed as excluded.

## 6. Score eligibility (final vs provisional)

An overall score is presented as **final** only when _all_ of the following hold; otherwise it is labelled **provisional** (or unavailable):

1. the assessment has at least one assessable control;
2. coverage ≥ the configured **coverage threshold** (default **80%**, stored in `app_settings`, editable by an administrator);
3. every active category has at least one applicable control;
4. every active category has at least one _assessed_ applicable control (score known);
5. no active category has weight 0;
6. an overall score exists.

`ScoreResult.eligibilityReasons` lists every condition that failed, and the UI shows those reasons verbatim. **An assessment cannot be completed while the score is provisional** — the API refuses with `409 Conflict` and returns the reasons plus the current coverage, rather than publishing a misleading final score.

Draft and in-progress assessments may display a provisional score, always labelled _Provisional_.

## 7. Snapshot and versioning

- On completion, the full `ScoreResult` plus `methodology_version` is frozen on the assessment row.
- Later changes to weights, rubric, threshold or the control library **do not** alter completed assessments (covered by an integration test).
- Editing a completed assessment is refused; reopening is an explicit, audited action.

## 8. Comparison and history

`compareScores(previous, current)` produces the score change plus per-category changes, and emits **caveats** instead of silently reporting improvement when:

- the methodology version differs between the two assessments;
- the assessment scope text differs;
- coverage changed by ≥ 10 percentage points;
- either score is provisional;
- the score rose while _more_ categories became unassessed.

A comparison with caveats is marked **not comparable**, and the UI displays the caveats.

## 9. Interpretation limitations

- The score reflects only what was assessed, at the time it was assessed, with the weights then in force.
- A high score with low coverage or open critical findings is explicitly flagged; critical findings remain visible regardless of the overall score (the dashboard and reports always show critical/high counts alongside the score).
- The control library is a practical starting framework — it is **not** a claim of compliance with ISO 27001, NIST CSF or any other standard, and the reports say so.
- Scores must not be averaged across unrelated assessment scopes without disclosing the limitation (the dashboard discloses it and only averages comparable completed assessments).
