# Free service limits

## Summary

Visitors may run multiple free checks. The former permanent one-service-per-visitor
gate has been removed. The public endpoint now uses three rolling, DB-backed
limits plus the existing 10 requests/minute/IP limiter.

Only runs with `free_service_runs.status = 'completed'` count toward the rolling
limits. Thrown errors and unreachable website checks are stored as `failed` and do
not consume a visitor's quota.

## Limits

| Environment variable | Default | Scope | Window |
|---|---:|---|---|
| `FREE_CHECKS_PER_VISITOR_PER_DAY` | `5` | Anonymous visitor matched by visitor cookie, browser fingerprint hash, or IP hash | Rolling 24 hours |
| `FREE_CHECKS_PER_IP_PER_DAY` | `20` | IP hash | Rolling 24 hours |
| `FREE_CHECKS_PER_TARGET_PER_HOUR` | `3` | Normalized website/domain target | Rolling 60 minutes |
| `CLIENT_FREE_CHECKS_PER_DAY` | `20` | Signed-in client account (`visitors.client_id`) | Rolling 24 hours |

The per-minute limiter in `server/src/routes/public.ts` remains 10 requests per
minute per IP and is never skipped.

When a signed-in client submits a free check, the signed-in account limit replaces
the anonymous visitor limit. The per-IP and per-target limits still apply.

## Limit response

When a limit is reached, `POST /api/v1/public/free-runs` returns HTTP `429` with:

```json
{
  "error": {
    "code": "free_check_limit_reached",
    "message": "Free check limit reached for this visitor. Try again in 86399 seconds or create a free account for a higher limit.",
    "details": {
      "limit": "visitor",
      "label": "visitor",
      "used": 5,
      "max": 5,
      "windowMs": 86400000,
      "resetAt": "2026-11-22T10:15:00.000Z",
      "retryAfterSeconds": 86399
    }
  }
}
```

`resetAt` is the time the oldest completed run in the rolling window expires.
The client displays this time and a link to create a free account.

## Testing escape hatch

`FREE_CHECKS_UNLIMITED=true` skips the per-visitor, per-IP and per-target checks.
It does not skip the 10 requests/minute/IP limiter. Keep it `false` in
production; `render.yaml` now sets it explicitly to `false`.

## Visitor records

`reserveFreeService()` in `server/src/repositories/visitors.ts` still creates and
updates the visitor row (`cookie_id`, `ip_hash`, `fingerprint_hash`, `email`,
`client_id`) so completed results can be linked to an account at signup. It no
longer writes `free_service_used`/`free_used_at` and no longer returns a `409`.

## Migration

Migration version 4 adds two indexes on existing columns:

- `free_service_runs(status, created_at DESC)`
- `free_service_runs(target, created_at DESC)`

The existing `visitors(ip_hash)`, `visitors(fingerprint_hash)` and
`free_service_runs(visitor_id, created_at DESC)` indexes cover the other counts.
No table columns were added or changed. Apply migration 4 to Neon before
deploying this change; it has not been run against Neon by this work.

## Files touched

- `server/src/config/env.ts` - new limit env vars.
- `server/src/repositories/free-limits.ts` - limit counting and 429 details.
- `server/src/repositories/visitors.ts` - permanent gate removed, visitor tracking kept.
- `server/src/repositories/free-runs.ts` - stores `failed` status with result for unreachable checks.
- `server/src/routes/public.ts` - 429 handling, normalized target storage, signed-in limit.
- `server/src/database/migrations.ts` - version 4 indexes.
- `client/src/pages/public/FreeCheck.tsx` - friendly 429/reset-time UI.
- `.env.example`, `render.yaml` - new env vars.
- `tests/integration/api.test.ts`, `tests/integration/client-portal.test.ts` - updated coverage.
