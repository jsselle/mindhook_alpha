# Epic 13: Reminder LLM Orchestration and End-to-End Hardening

| Field | Value |
|---|---|
| Epic | 13 |
| Title | Reminder LLM Orchestration and End-to-End Hardening |
| Priority | P0 |
| Dependencies | Epics 10, 11.1, 11.2, 12 |
| Deliverable | Production-grade reminder behavior across LLM, tools, notifications, and UI |

## Objective

Finalize reminder feature by aligning prompt/tool behavior, adding retrieval semantics for reminders, and validating end-to-end flows under failure and edge timing conditions.

## Scope

### In Scope
- Prompt updates for reminder creation/reschedule/cancel/list behavior.
- Activity strip labels for reminder tools/actions.
- End-to-end tests covering reminder lifecycle.
- Reliability hardening for timezone, past dates, and stale notifications.
- Final QA checklist and rollout guardrails.

### Out of Scope
- Multi-screen navigation redesign.
- Remote push notification service.

## Prompting and Tool Use Policy

### System Prompt Additions

**File: `backend_server/src/gemini/systemPrompt.ts`**

Add section:
- For user reminder intents, LLM should prefer:
  - `create_reminder` for new asks.
  - `update_reminder` for "move/reschedule/change".
  - `cancel_reminder` for "don't remind me/delete/cancel".
  - `list_reminders` for "what reminders do I have".
- Must use provided `user_time` context for relative time parsing.
- Must not claim reminder is scheduled unless tool call succeeded.
- User-facing reply should include localized time confirmation.

### Retrieval Prompt Additions

**File: `backend_server/src/gemini/retrievalPrompt.ts`**

Add reminder retrieval rules:
1. If query is reminder-list/status oriented, call `list_reminders` first.
2. If query is memory/history oriented, keep `search_memory` first.
3. Never expose internal IDs/tool names in final user-facing text.

## Required Tool Validation Hardening

### Time Parsing and Bounds

Enforce in dispatcher and/or backend validation:
- Reject due_at older than `now - 30s`.
- Reject due_at farther than 2 years ahead (guardrail against parse errors).
- Require timezone string for create; preserve existing timezone if omitted on update.

### Stale Notification Reconciliation on App Start

On app start:
1. Read all active reminders.
2. Query scheduled notification IDs from notifications API.
3. For each active reminder:
   - If due in future but no due notification, reschedule.
   - If pre-alert missing and still relevant window, reschedule pre-alert.
4. Record `schedule_error` or `scheduled_notifications` events accordingly.

Implement in:
- `src/notifications/notificationBootstrap.ts`

## End-to-End Test Matrix

### E2E/Integration Scenarios

Create `src/__tests__/e2e/remindersLifecycle.test.ts` with at least:
1. User says "Remind me to call mom tomorrow at 9am."
   - LLM calls `create_reminder`.
   - Reminder row exists with active notification IDs.
2. User says "Actually make it 9:30."
   - LLM calls `update_reminder`.
   - Notification IDs change.
3. Due notification action `SNOOZE_10M`.
   - Row status `snoozed`, due_at shifted +10m.
4. Pre-alert appears and `EARLY_DISMISS` tapped.
   - Row status `deleted`, alarms canceled.
5. Reply action opens app and auto-sends contextual message.
   - LLM can issue `update_reminder` from that reply context.

### Regression Test Requirements

- All existing suites from Epics 1-12 pass.
- No protocol changes break `useWebSocket` tests.
- Activity mapping includes new reminder tool labels.

## Operational Metrics (Local Debug / QA)

Add lightweight debug counters surfaced via logs or debug modal:
- Active reminders count.
- Scheduled due notifications count.
- Scheduled pre-alert notifications count.
- Reminder event count by type in last 24h.

## Rollout and Failure Behavior

If scheduling fails:
- Keep reminder row with active status.
- Set `last_error`.
- Show user fallback assistant text:
  - "I saved the reminder but could not schedule the alert. Please reopen the app and I will retry."
- App bootstrap must retry scheduling later.

## Acceptance Criteria

- [ ] System/retrieval prompts include explicit reminder tool routing rules.
- [ ] Relative time reminder requests consistently resolve with `user_time`.
- [ ] Startup reconciliation repairs missing schedules for active reminders.
- [ ] End-to-end reminder lifecycle test suite added and passing.
- [ ] No regressions in existing tests.
- [ ] Debug visibility for reminder runtime health is available.

## Completion Report

Create `reports/epic_13_report.md` with:
- Prompt diffs for reminder policy.
- E2E test evidence and logs.
- Failure/recovery test evidence.
- Remaining known limitations and follow-up backlog.
