# Epic 10 Report: Reminder Domain, Storage, and Tool Contracts

## Implemented Files

- `src/db/schema.ts`
- `src/db/connection.ts`
- `src/types/domain.ts`
- `src/api/deviceWriteApi.ts`
- `src/api/deviceReadApi.ts`
- `src/api/index.ts`
- `src/tools/dispatcher.ts`
- `src/utils/activityMapping.ts`
- `backend_server/src/tools/definitions.ts`
- `src/db/__tests__/schema.test.ts`
- `src/db/__tests__/connection.test.ts`
- `src/api/__tests__/deviceWriteApi.test.ts`
- `src/api/__tests__/deviceReadApi.test.ts`
- `src/tools/__tests__/dispatcher.test.ts`
- `src/utils/__tests__/activityMapping.test.ts`
- `backend_server/src/tools/__tests__/definitions.test.ts`

## Schema Diff Summary

- `SCHEMA_VERSION` incremented from `3` to `4`.
- Added `reminders` table with:
  - lifecycle status (`scheduled`, `triggered`, `snoozed`, `completed`, `deleted`)
  - reminder content fields (`title`, `topic`, `notes`)
  - scheduling intent/state fields (`due_at`, `timezone`, `pre_alert_minutes`, notification IDs)
  - lifecycle timestamps/error fields (`delivered_at`, `completed_at`, `deleted_at`, `last_error`)
  - metadata and audit timestamps (`metadata_json`, `created_at`, `updated_at`)
- Added reminder indexes:
  - `idx_reminders_status_due`
  - `idx_reminders_due_at`
  - `idx_reminders_created_at`
- Added `reminder_events` table with event type and actor constraints.
- Added reminder event index:
  - `idx_reminder_events_reminder`
- Added additive migration handling in connection init:
  - `ensureColumns` for reminder backfill-compatible columns
  - backfill SQL:
    - `UPDATE reminders SET updated_at = created_at WHERE updated_at IS NULL;`
    - `UPDATE reminders SET pre_alert_minutes = 10 WHERE pre_alert_minutes IS NULL;`

## Tool Contract Summary

- Added backend tool declarations:
  - `create_reminder`
  - `update_reminder`
  - `cancel_reminder`
  - `list_reminders`
- All reminder tools require `schema_version: "1"`.
- Frontend dispatcher now executes all reminder tools and enforces:
  - due-time validation (`due_at <= now - 30s` rejected)
  - `pre_alert_minutes` bounds (`0..1440`)
  - immutable field protection (`created_at` cannot be patched)
  - optimistic concurrency using `expected_updated_at`
  - logical delete semantics (`status='deleted'`, no physical delete)
  - status transition validation through write API
- Added scheduler abstraction for Epic 11:
  - `ReminderNotificationScheduler` interface
  - default no-op implementation (returns `null` notification IDs)
- Added hardening behaviors:
  - richer event payloads for `created`, `updated`, `deleted`
  - explicit `scheduled_notifications` and `schedule_error` event writes
  - scheduler failure persistence via `last_error` + retryable tool error

## Test Command Outputs

### App targeted suites

Command:

`npm test -- --runInBand src/db/__tests__/schema.test.ts src/db/__tests__/connection.test.ts src/api/__tests__/deviceWriteApi.test.ts src/api/__tests__/deviceReadApi.test.ts src/tools/__tests__/dispatcher.test.ts src/utils/__tests__/activityMapping.test.ts`

Result:

- Test Suites: `6 passed, 6 total`
- Tests: `66 passed, 66 total`

### Backend targeted suite

Command:

`npm test -- --runInBand src/tools/__tests__/definitions.test.ts` (run in `backend_server`)

Result:

- Test Suites: `1 passed, 1 total`
- Tests: `2 passed, 2 total`

## Known Limitations

- Real OS notification scheduling/cancellation is not implemented yet (expected for Epic 10).
- Reminder scheduling currently uses a no-op scheduler with `null` notification IDs.
- Foreground reply bridge is not implemented yet (Epic 11.2).
- Reminder drawer/list UI flows are not implemented yet (Epic 12).
