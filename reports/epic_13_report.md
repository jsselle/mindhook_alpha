# Epic 13 Report: Reminder LLM Orchestration and End-to-End Hardening

## Scope Delivered

Implemented Epic 13 hardening and orchestration work across:

- Prompt/tool routing policy for reminder intents.
- Dispatcher/backend validation guardrails for reminder due times and update field validation.
- Startup reconciliation for stale/missing local schedules.
- End-to-end reminder lifecycle coverage.
- Runtime fallback behavior when scheduling fails.
- Additional reliability tests to prevent regressions.

## Prompt Policy Diffs

Updated prompt files:

- `backend_server/src/gemini/systemPrompt.ts`
- `backend_server/src/gemini/retrievalPrompt.ts`

### `systemPrompt.ts` additions

- Explicit reminder tool routing:
  - `create_reminder` for new asks
  - `update_reminder` for move/reschedule/change
  - `cancel_reminder` for delete/cancel
  - `list_reminders` for list/status asks
- Explicit requirement to use `user_time` for relative-time parsing.
- Explicit instruction to avoid success claims when tool call failed.
- Explicit requirement for localized time confirmation on success.
- Explicit scheduling-failure fallback sentence policy.

### `retrievalPrompt.ts` additions

- Reminder retrieval rules:
  - reminder list/status queries route to `list_reminders` first
  - memory/history queries still route to `search_memory` first
  - no internal IDs/tool names in user-facing text

## Reliability Hardening Implemented

### 1) Tool validation hardening

Updated:

- `src/tools/dispatcher.ts`
- `backend_server/src/tools/definitions.ts`

Changes:

- `due_at` now rejected if:
  - older than `now - 30s` (existing behavior retained)
  - farther than 2 years in future (new guardrail)
- `update_reminder` input parsing now enforces:
  - `title` and `timezone` must be non-empty strings when present
  - `null` for `title`/`timezone` is rejected with `INVALID_ARGS`
  - `topic`/`notes` remain nullable
- Tool contract aligned so `update_reminder.timezone` is optional but not nullable in schema.

### 2) Startup reconciliation

Updated:

- `src/notifications/notificationBootstrap.ts`

Changes:

- Reconciliation now runs at startup after scheduler registration.
- Active reminders are scanned with pagination (not fixed 500 cap).
- For active reminders:
  - if due is future and due notification is missing, reschedule
  - if pre-alert is relevant and missing, reschedule
- Records:
  - `scheduled_notifications` on successful repair
  - `schedule_error` on failure
- Added in-flight bootstrap lock to prevent duplicate listener registration from concurrent calls.
- Added defensive non-fatal handling if reconciliation/debug queries fail.

### 3) Runtime initialization order

Updated:

- `app/_layout.tsx`
- `src/screens/ChatScreen.tsx`

Changes:

- Notification bootstrap moved out of root layout startup path.
- Bootstrap now runs after `initializeDatabase()` success in chat screen init flow.
- Prevents pre-DB reminder query failures during early app lifecycle.

### 4) Stale notification safety

Updated:

- `src/notifications/reminderNotificationService.ts`

Changes:

- Incoming notification payload now requires `due_at`.
- Notification handlers ignore stale payloads if payload `due_at` differs from latest reminder `due_at`.
- Ignored stale actions are logged as non-destructive `updated` events with diagnostic payload.

### 5) Manual reply durability

Updated:

- `src/screens/reminderReplyForegroundBridge.ts`

Changes:

- When manual confirmation is required, consumed pending reply is released back to queue.
- Prevents loss if app is closed before manual send.
- If no `onNeedsConfirmation` callback is provided, function returns `false` and still requeues.

### 6) Deterministic fallback text for scheduling failures

Updated:

- `src/hooks/useWebSocket.ts`

Changes:

- If `create_reminder`/`update_reminder` tool call fails with scheduling failure message,
  final assistant response is forced to include:
  - `"I saved the reminder but could not schedule the alert. Please reopen the app and I will retry."`
- This is runtime-enforced (not prompt-only), ensuring deterministic user-visible behavior.

## E2E / Integration Evidence

### New lifecycle test

Added:

- `src/__tests__/e2e/remindersLifecycle.test.ts`

Covered scenarios:

1. Create reminder (future due) schedules IDs.
2. Update/reschedule changes notification IDs.
3. Snooze action updates status to `snoozed` and shifts due time.
4. Pre-alert early dismiss transitions reminder to deleted and clears IDs.
5. Reply action queues bridge item and supports update flow from reply context.

### Additional hardening/regression tests

Updated:

- `src/tools/__tests__/dispatcher.test.ts`
- `src/notifications/__tests__/notificationBootstrap.test.ts`
- `src/notifications/__tests__/reminderNotificationService.test.ts`
- `src/screens/__tests__/ChatScreen.reminderReply.test.tsx`
- `src/hooks/__tests__/useWebSocket.test.ts`
- `src/notifications/__tests__/reminderReplyFlow.integration.test.ts`

Added assertions for:

- due-at 2-year bound rejection
- null/invalid `update_reminder` fields rejection
- concurrent bootstrap dedup
- bootstrap failure tolerance
- bootstrap pagination behavior
- stale notification ignore behavior
- manual confirmation reply requeue
- deterministic scheduling-failure fallback text injection

## Full Test Run Evidence

Executed:

`npm test -- --runInBand`

Result:

- Test Suites: `31 passed, 31 total`
- Tests: `256 passed, 256 total`
- Snapshots: `0`

## Failure / Recovery Evidence

Verified by test:

- Scheduler failure during reminder tool flow triggers deterministic user fallback text.
- Bootstrap reconciliation attempts to repair missing schedules.
- Reconciliation failures are captured as `schedule_error` without crashing bootstrap.
- Startup bootstrap no longer depends on pre-initialized DB from root layout path.
- Stale notifications do not mutate current reminder state.

## Remaining Known Limitations / Follow-up Backlog

1. Current scheduling-failure fallback detection in websocket layer is message-pattern based; could be upgraded to structured error metadata for stronger guarantees.
2. Debug counters are logged to console only; if a debug modal view is desired, wire these counters to a surfaced UI state endpoint/store.
3. Reconciliation pagination uses a defensive max-offset guard; if reminder volume expectations increase, move to cursor-based paging in read API.
4. Existing test output still includes `ts-jest` deprecation warning for `isolatedModules`; update shared ts-jest config to remove warning.
