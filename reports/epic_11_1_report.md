# Epic 11.1 Report: Device Notification Runtime for Reminders

## Implemented Files

- `src/notifications/types.ts`
- `src/notifications/reminderNotificationService.ts`
- `src/notifications/notificationBootstrap.ts`
- `src/notifications/__tests__/reminderNotificationService.test.ts`
- `src/notifications/__tests__/notificationBootstrap.test.ts`
- `src/__mocks__/expo-notifications.ts`
- `app/_layout.tsx`
- `app.json`
- `package.json`
- `jest.config.js`
- `src/tools/__tests__/dispatcher.test.ts` (extended integration assertions)

## Device Permission Behavior (iOS/Android)

- Runtime bootstrap requests notification permissions via `Notifications.requestPermissionsAsync()`.
- Android notification channel setup is attempted with high importance:
  - Channel ID: `reminders`
  - Vibration pattern enabled
  - Public lockscreen visibility
- Android manifest permissions in config include `POST_NOTIFICATIONS` (via `app.json`).
- Category/action setup is platform-agnostic; Android-only channel creation is guarded with a safe try/catch fallback.

## Category/Action Matrix

Configured categories:

- `REMINDER_DUE`
  - `REMINDER_ACCEPT`
  - `REMINDER_DISMISS`
  - `REMINDER_SNOOZE_10M`
  - `REMINDER_REPLY`
- `REMINDER_PRE_ALERT`
  - `REMINDER_EARLY_DISMISS`

Implemented action behavior:

- `REMINDER_ACCEPT`
  - Sets `status='completed'`, `completed_at=now`, clears notification IDs, writes `completed` event (`actor='user'`).
- `REMINDER_DISMISS`
  - Logical delete with reason `dismissed_from_notification`, clears notification IDs, writes `deleted` event (`actor='user'`).
- `REMINDER_EARLY_DISMISS`
  - Logical delete with reason `early_dismiss_pre_alert`, clears notification IDs, writes `deleted` event (`actor='user'`).
- `REMINDER_SNOOZE_10M`
  - Sets `status='snoozed'`, updates `due_at=now+600000`, writes `snoozed` event with previous/new due.
  - Reschedules notifications after transaction commit.
- `REMINDER_REPLY`
  - Writes `reply_requested` event (`actor='user'`) for Epic 11.2 bridge handoff.

Terminal reminder handling:

- If reminder status is `completed` or `deleted`, actions are ignored and an `updated` event with note `action_ignored_terminal` is recorded.

## Scheduler Logs/Examples

Scheduler implementation (`createReminderNotificationScheduler`) behavior:

1. Cancels existing scheduled notification IDs (if present).
2. Schedules due notification when `due_at > now`.
3. Schedules pre-alert notification only when `due_at - pre_alert_minutes*60000 > now`.
4. Returns `{ due_notification_id, pre_notification_id }` for persistence.

Delivery callbacks:

- On pre-alert delivery: writes `pre_alert_triggered`.
- On due delivery: if reminder not terminal, sets `status='triggered'`, sets `delivered_at`, writes `due_triggered`.

Error fallback:

- Snooze reschedule failures persist `last_error` and write `schedule_error`.

## Test Run Summary

### Notification + dispatcher-focused suites

Command:

`npm test -- --runInBand src/notifications/__tests__/reminderNotificationService.test.ts src/notifications/__tests__/notificationBootstrap.test.ts src/tools/__tests__/dispatcher.test.ts`

Result:

- Test Suites: `3 passed, 3 total`
- Tests: `40 passed, 40 total`

### Broader reminder/runtime targeted suites

Command:

`npm test -- --runInBand src/db/__tests__/schema.test.ts src/db/__tests__/connection.test.ts src/api/__tests__/deviceWriteApi.test.ts src/api/__tests__/deviceReadApi.test.ts src/tools/__tests__/dispatcher.test.ts src/notifications/__tests__/reminderNotificationService.test.ts src/notifications/__tests__/notificationBootstrap.test.ts`

Result:

- Test Suites: `7 passed, 7 total`
- Tests: `70 passed, 70 total`

## Notes

- Dependency entries for `expo-notifications` and `expo-device` were added to `package.json`.
- `package-lock.json` was not updated in this session; run `npm install` to sync lockfile before release/CI.
