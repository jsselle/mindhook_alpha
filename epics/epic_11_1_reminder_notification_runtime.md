# Epic 11.1: Device Notification Runtime for Reminders

| Field | Value |
|---|---|
| Epic | 11.1 |
| Title | Device Notification Runtime for Reminders |
| Priority | P0 |
| Dependencies | Epic 10 |
| Deliverable | Real local notification scheduling/canceling for reminders |

## Objective

Implement device-managed reminder notifications with two triggers:
- Pre-alert: "Reminder coming soon: {title}" with early dismiss action.
- Due alert: actual reminder notification with actions.

All reminders are scheduled/canceled on device only. Backend never sends push/alarms.

## Scope

### In Scope
- Integrate notification library and permissions.
- Define notification categories/channels.
- Implement scheduler service used by dispatcher.
- Handle notification actions for dismiss/snooze/accept.
- Sync scheduled notification IDs to SQLite.

### Out of Scope
- Free-form reply action forwarding to LLM (Epic 11.2).
- Reminder drawer UI (Epic 12).

## Platform Strategy

Use `expo-notifications` as baseline. If inline text input action is not stable for required OS versions, keep reply as "open app with context" in Epic 11.2.

### Dependencies

**File: `package.json`**

Add:
- `"expo-notifications": "~0.x.x"` (matching Expo SDK 54 recommended version)
- If required by SDK docs, include `"expo-device"` as companion dependency.

### App Config

**File: `app.json`**

Add plugin:

```json
"plugins": [
  "expo-router",
  "expo-sqlite",
  ["expo-notifications", { "sounds": ["./assets/sounds/reminder.wav"] }]
]
```

Android:
- Add notification permission if needed by SDK defaults.
- Configure channel `reminders` with high importance and vibration.

## Notification Action Contracts

### Categories

- `REMINDER_DUE`
  - `REMINDER_ACCEPT` (mark completed)
  - `REMINDER_DISMISS` (logical delete with reason `dismissed_from_notification`)
  - `REMINDER_SNOOZE_10M` (set due to now+10m, status `snoozed`)
  - `REMINDER_REPLY` (opens app with reply context; forwarding is Epic 11.2)

- `REMINDER_PRE_ALERT`
  - `REMINDER_EARLY_DISMISS` (logical delete with reason `early_dismiss_pre_alert`)

### Notification Content Payload Schema

Every scheduled notification must include data payload:

```ts
interface ReminderNotificationData {
  reminder_id: string;
  kind: 'pre_alert' | 'due';
  title: string;
  due_at: number;
  timezone: string;
  source: 'reminder_scheduler_v1';
}
```

## Required Files

- `src/notifications/reminderNotificationService.ts`
- `src/notifications/notificationBootstrap.ts`
- `src/notifications/types.ts`

Hook bootstrap at app startup (single-screen app still needs global listener registration), likely in root layout/bootstrap module used before `ChatScreen`.

## Scheduler Interface Implementation

Implement Epic 10 interface concretely:

```ts
scheduleReminder(args): Promise<{ due_notification_id: string | null; pre_notification_id: string | null }>
cancelReminderNotifications(args): Promise<void>
```

Behavior:
1. Cancel existing IDs if present.
2. Compute due trigger from `due_at`.
3. Compute pre-alert trigger from `due_at - pre_alert_minutes`.
4. Schedule due notification always if future.
5. Schedule pre-alert only when trigger in future.
6. Persist returned notification IDs on reminder row.
7. Insert `reminder_events` rows for `scheduled_notifications` or `schedule_error`.

## Action Handling Rules

### `REMINDER_ACCEPT`
- Update reminder: `status='completed'`, `completed_at=now`, `updated_at=now`.
- Cancel pending pre/due notifications.
- Write event: `completed` actor=`user`.

### `REMINDER_DISMISS`
- Logical delete reminder with reason.
- Cancel pending notifications.
- Write event: `deleted` actor=`user`.

### `REMINDER_SNOOZE_10M`
- New due: `now + 10*60_000`.
- `status='snoozed'`.
- Reschedule pre/due.
- Write event: `snoozed` actor=`user` payload with previous and new due.

### `REMINDER_EARLY_DISMISS`
- Same as dismiss but reason `early_dismiss_pre_alert`.

### Trigger Capture
On notification delivery callback:
- If `kind='pre_alert'`, write `pre_alert_triggered`.
- If `kind='due'`, set `status='triggered'` if currently active, set `delivered_at=now`, write `due_triggered`.

## Algorithm: Idempotent Action Processing

Input: action payload `(reminder_id, action_id, ts)`.

1. Load reminder by id.
2. If not found, return success no-op.
3. If status terminal (`deleted`/`completed`), no-op and record event `updated` with note `action_ignored_terminal`.
4. Apply action transition.
5. Persist row and event in single transaction.
6. If transition requires schedule changes, call scheduler after commit.
7. On scheduler failure, keep row state but set `last_error`, add `schedule_error`.

## Tests

### Unit Tests
- `src/notifications/__tests__/reminderNotificationService.test.ts`
- `src/notifications/__tests__/notificationBootstrap.test.ts`
- Extend `src/tools/__tests__/dispatcher.test.ts`

Required cases:
- Schedules due + pre-alert when both future.
- Skips pre-alert when already inside pre-alert window.
- Cancels old notification IDs before reschedule.
- Action handlers apply correct status transitions.
- Snooze 10m updates due time approximately `now+600000`.
- Terminal reminders ignore further actions.

### Integration Tests (Mocked Notifications API)
- Create reminder via dispatcher -> notification IDs persisted.
- Cancel reminder -> notification cancel called, row status `deleted`.
- Trigger due callback -> row status `triggered` and event logged.

## Acceptance Criteria

- [ ] `expo-notifications` integrated with runtime bootstrap.
- [ ] Reminder notifications scheduled locally from reminder rows.
- [ ] Due and pre-alert categories/actions registered.
- [ ] Early dismiss from pre-alert works.
- [ ] Accept/dismiss/snooze(10m) from due notification works.
- [ ] Notification IDs tracked in DB and resynced on updates.
- [ ] Existing tests remain green.

## Completion Report

Create `reports/epic_11_1_report.md` with:
- Device permission behavior (iOS/Android).
- Category/action matrix tested.
- Scheduler logs/examples.
- Test run summary.
