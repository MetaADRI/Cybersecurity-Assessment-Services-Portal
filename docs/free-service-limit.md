# Free service limit: temporary testing mode

## Summary

The public site normally allows **one free service per visitor**. While the free
checks are being tested, that rule is turned off with an environment flag:

```dotenv
FREE_CHECKS_UNLIMITED=true
```

The flag is currently set in the local `.env`. Set it to `false` (or delete the
line) and restart the server to restore the original behaviour.

## What the original rule did

The limit was enforced in `reserveFreeService()` in
`server/src/repositories/visitors.ts`, inside an immediate SQLite transaction so
two parallel requests could not both pass the check.

A visitor was blocked when any of these matched:

1. The visitor cookie (`odcmp_visitor`) already had `free_service_used` set.
2. Another visitor row had the same browser fingerprint hash and a used service.
3. Another visitor row had the same email and a used service.

When blocked, `server/src/routes/public.ts` returned HTTP `409` with the error
code `free_service_used` and the previously used service key. The client
(`FreeCheck.tsx`) showed a message and a link to create an account.

On a successful reservation, the visitor row stored `free_service_used` and
`free_used_at`. Free runs, results and PDF reports were still created normally.

## How the temporary mode works

- `FREE_CHECKS_UNLIMITED` is parsed in `server/src/config/env.ts`. It defaults to
  `false` when unset and accepts `true` or `1` to enable the testing mode.
- `public.ts` passes it to `reserveFreeService()` as `allowRepeat`.
- With `allowRepeat: true`, the visitor is still created/updated and
  `free_service_used` is still recorded (now the most recent service), but the
  one-per-visitor, fingerprint and email blocking checks are skipped.
- Everything else is unchanged: the public rate limiter (10 requests per minute
  per IP) still applies, runs are stored, and reports are generated.

## Restore the original rule

1. In `.env`, set `FREE_CHECKS_UNLIMITED=false` or remove the line.
2. Restart the API/server process.
3. Optionally update the remaining "unlimited while testing" copy:
   - `client/src/pages/public/FreeCheck.tsx` - footer text.
   - `client/src/pages/public/Landing.tsx` - "Free checks and tools" section.
   - `shared/free-services.ts` - `SERVICE_FREE_WORDING` strings.
4. Run `npm run typecheck`, `npm test` and a manual 409 check against
   `POST /api/v1/public/free-runs`.

No database migration is needed. Existing `visitors.free_service_used` values are
preserved; they will be enforced again as soon as the flag is off.

## Files touched

- `server/src/config/env.ts` - new `FREE_CHECKS_UNLIMITED` flag.
- `server/src/repositories/visitors.ts` - `allowRepeat` option.
- `server/src/routes/public.ts` - passes the flag into the reservation.
- `.env` / `.env.example` - local setting and template documentation.
- `tests/integration/api.test.ts`, `tests/integration/client-portal.test.ts`,
  `playwright.config.ts` - explicitly set the flag to `false` so the original
  blocking behaviour remains covered by tests.
