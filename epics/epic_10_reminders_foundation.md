# Epic 10: Reminder Domain, Storage, and Tool Contracts

| Field | Value |
|---|---|
| Epic | 10 |
| Title | Reminder Domain, Storage, and Tool Contracts |
| Priority | P0 |
| Dependencies | Epics 1.2, 1.4, 3.1, 3.2, 4, 5, 7 |
| Predecessors | SQLite schema, device APIs, WS run loop, tool bridge |
| Deliverable | Durable reminder model + reminder tools callable by LLM |

## Objective

Establish reminders as a first-class domain on device. This epic defines:
- SQLite schema for reminders and reminder event history.
- Device read/write APIs for reminder lifecycle.
- Tool declarations on backend.
- Tool dispatcher support on frontend.
- Deterministic status model and scheduling intent data.

Reminder delivery must be device-managed only. Backend never schedules notifications.

## Scope

### In Scope
- New tables: `reminders`, `reminder_events`.
- Additive migrations in `src/db/connection.ts`.
- Domain types in `src/types/domain.ts`.
- Read/write API methods in `src/api/deviceWriteApi.ts` and `src/api/deviceReadApi.ts`.
- Tool definitions in `backend_server/src/tools/definitions.ts`.
- Tool execution handlers in `src/tools/dispatcher.ts`.
- Activity mapping labels for reminder tools.

### Out of Scope
- Actual OS notification scheduling (Epic 11.1).
- Reply action foreground bridge (Epic 11.2).
- Drawer UI for reminder list/edit/delete (Epic 12).

## Data Model (Source of Truth)

### Reminder Status State Machine

Allowed `status` values:
- `scheduled`: active reminder, future due time.
- `triggered`: due notification fired at least once.
- `snoozed`: active reminder with updated due time.
- `completed`: accepted/done by user.
- `deleted`: logical delete requested by user.

Allowed transitions:
- `scheduled -> triggered|snoozed|completed|deleted`
- `snoozed -> triggered|snoozed|completed|deleted`
- `triggered -> snoozed|completed|deleted`
- terminal: `completed`, `deleted`

No transition can leave terminal states.

### SQL Schema

**File: `src/db/schema.ts`**

Increment `SCHEMA_VERSION` from `3` to `4`.

Add:

```sql
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT,
  notes TEXT,
  due_at INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('scheduled', 'triggered', 'snoozed', 'completed', 'deleted')),
  source_message_id TEXT,
  source_run_id TEXT,
  pre_alert_minutes INTEGER NOT NULL DEFAULT 10,
  due_notification_id TEXT,
  pre_notification_id TEXT,
  delivered_at INTEGER,
  completed_at INTEGER,
  deleted_at INTEGER,
  deleted_reason TEXT,
  last_error TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_status_due ON reminders(status, due_at);
CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at);
CREATE INDEX IF NOT EXISTS idx_reminders_created_at ON reminders(created_at);

CREATE TABLE IF NOT EXISTS reminder_events (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'created',
    'updated',
    'scheduled_notifications',
    'pre_alert_triggered',
    'due_triggered',
    'snoozed',
    'completed',
    'deleted',
    'reply_requested',
    'reply_sent_to_llm',
    'schedule_error'
  )),
  event_at INTEGER NOT NULL,
  actor TEXT NOT NULL CHECK(actor IN ('llm', 'user', 'system')),
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(reminder_id) REFERENCES reminders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reminder_events_reminder ON reminder_events(reminder_id, event_at DESC);
```

### Additive Migration Requirements

**File: `src/db/connection.ts`**

After executing DDL:
- Ensure tables exist via DDL (already idempotent).
- If `reminders` exists but missing columns in older install states, call `ensureColumns` for:
  - `topic`, `notes`, `pre_alert_minutes`, `due_notification_id`, `pre_notification_id`, `delivered_at`, `completed_at`, `deleted_at`, `deleted_reason`, `last_error`, `metadata_json`, `updated_at`.
- Run backfill:
  - `UPDATE reminders SET updated_at = created_at WHERE updated_at IS NULL;`
  - `UPDATE reminders SET pre_alert_minutes = 10 WHERE pre_alert_minutes IS NULL;`

## Domain Types

**File: `src/types/domain.ts`**

Add:

```ts
export type ReminderStatus = 'scheduled' | 'triggered' | 'snoozed' | 'completed' | 'deleted';
export type ReminderEventType =
  | 'created'
  | 'updated'
  | 'scheduled_notifications'
  | 'pre_alert_triggered'
  | 'due_triggered'
  | 'snoozed'
  | 'completed'
  | 'deleted'
  | 'reply_requested'
  | 'reply_sent_to_llm'
  | 'schedule_error';

export interface ReminderRow {
  id: string;
  title: string;
  topic: string | null;
  notes: string | null;
  due_at: number;
  timezone: string;
  status: ReminderStatus;
  source_message_id: string | null;
  source_run_id: string | null;
  pre_alert_minutes: number;
  due_notification_id: string | null;
  pre_notification_id: string | null;
  delivered_at: number | null;
  completed_at: number | null;
  deleted_at: number | null;
  deleted_reason: string | null;
  last_error: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

export interface ReminderEventRow {
  id: string;
  reminder_id: string;
  event_type: ReminderEventType;
  event_at: number;
  actor: 'llm' | 'user' | 'system';
  payload_json: string | null;
  created_at: number;
}
```

## Device API Contracts

### Write API

**File: `src/api/deviceWriteApi.ts`**

Add functions:
- `insertReminder(row: ReminderRow): Promise<void>`
- `updateReminder(args: { id: string; patch: Partial<ReminderRow>; updated_at: number }): Promise<void>`
- `logicalDeleteReminder(args: { id: string; deleted_at: number; reason: string; updated_at: number }): Promise<void>`
- `insertReminderEvent(row: ReminderEventRow): Promise<void>`

Rules:
- `logicalDeleteReminder` must set `status='deleted'`, `deleted_at`, `deleted_reason`, `updated_at`.
- No physical delete from `reminders`.
- `updateReminder` must block invalid status transitions (use transition table in memory, throw on invalid).

### Read API

**File: `src/api/deviceReadApi.ts`**

Add functions:
- `getReminderById(args: { reminder_id: string }): Promise<ReminderRow | null>`
- `listReminders(args: { statuses?: ReminderStatus[] | null; include_deleted?: boolean; limit: number; offset?: number }): Promise<ReminderRow[]>`
- `listUpcomingReminders(args: { now_ms: number; horizon_ms: number; limit: number }): Promise<ReminderRow[]>`
- `listReminderEvents(args: { reminder_id: string; limit: number }): Promise<ReminderEventRow[]>`

Sorting:
- Default list sort: `due_at ASC`, then `created_at ASC`.
- Deleted excluded unless `include_deleted=true`.

## Tool Contracts (LLM-facing)

### Tool 1: `create_reminder`

**File: `backend_server/src/tools/definitions.ts`**

```ts
{
  name: "create_reminder",
  description: "Create a device-managed reminder and schedule local notifications",
  parameters: {
    type: Type.OBJECT,
    properties: {
      reminder_id: { type: Type.STRING, description: "Optional; runtime generates if omitted" },
      title: { type: Type.STRING, description: "Short reminder title" },
      topic: { type: Type.STRING, nullable: true },
      notes: { type: Type.STRING, nullable: true },
      due_at: { type: Type.INTEGER, description: "Unix epoch ms in user's local intent" },
      timezone: { type: Type.STRING, description: "IANA tz, e.g., America/Los_Angeles" },
      pre_alert_minutes: { type: Type.INTEGER, nullable: true, description: "Default 10" },
      source_message_id: { type: Type.STRING, nullable: true },
      created_at: { type: Type.INTEGER },
      schema_version: { type: Type.STRING, enum: ["1"] }
    },
    required: ["title", "due_at", "timezone", "created_at", "schema_version"]
  }
}
```

Return payload from device:

```json
{
  "reminder_id": "uuid",
  "status": "scheduled",
  "due_at": 1760895000000,
  "pre_alert_at": 1760894400000
}
```

### Tool 2: `update_reminder`

```ts
{
  name: "update_reminder",
  description: "Update reminder fields, including due date/time and notes; reschedules local notifications",
  parameters: {
    type: Type.OBJECT,
    properties: {
      reminder_id: { type: Type.STRING },
      title: { type: Type.STRING, nullable: true },
      topic: { type: Type.STRING, nullable: true },
      notes: { type: Type.STRING, nullable: true },
      due_at: { type: Type.INTEGER, nullable: true },
      timezone: { type: Type.STRING, nullable: true },
      pre_alert_minutes: { type: Type.INTEGER, nullable: true },
      status: { type: Type.STRING, enum: ["scheduled", "snoozed", "completed", "deleted"], nullable: true },
      updated_at: { type: Type.INTEGER },
      schema_version: { type: Type.STRING, enum: ["1"] }
    },
    required: ["reminder_id", "updated_at", "schema_version"]
  }
}
```

### Tool 3: `cancel_reminder`

```ts
{
  name: "cancel_reminder",
  description: "Logical delete reminder and cancel any pending local notifications",
  parameters: {
    type: Type.OBJECT,
    properties: {
      reminder_id: { type: Type.STRING },
      reason: { type: Type.STRING, nullable: true },
      deleted_at: { type: Type.INTEGER },
      schema_version: { type: Type.STRING, enum: ["1"] }
    },
    required: ["reminder_id", "deleted_at", "schema_version"]
  }
}
```

### Tool 4: `list_reminders`

```ts
{
  name: "list_reminders",
  description: "List reminders sorted by due date ascending",
  parameters: {
    type: Type.OBJECT,
    properties: {
      statuses: { type: Type.ARRAY, items: { type: Type.STRING } , nullable: true },
      include_deleted: { type: Type.BOOLEAN, nullable: true },
      limit: { type: Type.INTEGER },
      offset: { type: Type.INTEGER, nullable: true },
      schema_version: { type: Type.STRING, enum: ["1"] }
    },
    required: ["limit", "schema_version"]
  }
}
```

## Frontend Dispatcher Behavior

**File: `src/tools/dispatcher.ts`**

Add handlers:
- `handleCreateReminder`
- `handleUpdateReminder`
- `handleCancelReminder`
- `handleListReminders`

Execution order in create/update/cancel:
1. Validate input.
2. Persist row changes.
3. Insert reminder event row.
4. Return canonical reminder response.

Notification scheduling hook point must be abstracted behind interface for Epic 11:

```ts
export interface ReminderNotificationScheduler {
  scheduleReminder(args: { reminder: ReminderRow; now_ms: number }): Promise<{ due_notification_id: string | null; pre_notification_id: string | null }>;
  cancelReminderNotifications(args: { reminder: ReminderRow }): Promise<void>;
}
```

For Epic 10, provide no-op implementation returning `null` IDs.

## Algorithm: Reminder Time Validation

1. If `due_at <= now - 30s`, reject with `INVALID_ARGS`.
2. If `pre_alert_minutes < 0` or `> 1440`, reject.
3. Compute `pre_alert_at = due_at - (pre_alert_minutes * 60_000)`.
4. If `pre_alert_at <= now`, pre-alert is skipped (store null notification id later in Epic 11).

## Tests

### New/Updated Test Files
- `src/db/__tests__/schema.test.ts`
- `src/db/__tests__/connection.test.ts`
- `src/api/__tests__/deviceWriteApi.test.ts`
- `src/api/__tests__/deviceReadApi.test.ts`
- `src/tools/__tests__/dispatcher.test.ts`
- `backend_server/src/tools/__tests__/definitions.test.ts` (create if absent)

### Required Test Cases
- Schema includes both reminder tables and indexes.
- Migration backfills `updated_at` and `pre_alert_minutes`.
- `insertReminder` + `listReminders` sorts earliest due first.
- Logical delete preserves row, sets `status='deleted'`.
- Invalid status transitions throw.
- `create_reminder` rejects past due dates.
- All new tools require `schema_version='1'`.
- Unknown reminder ID in update/cancel throws `FILE_NOT_FOUND` or `INVALID_ARGS`.

## Acceptance Criteria

- [ ] `SCHEMA_VERSION=4` with reminder tables present.
- [ ] Reminder domain types implemented and exported.
- [ ] Device read/write APIs implemented with tests.
- [ ] 4 new reminder tools defined on backend with complete schemas.
- [ ] Frontend dispatcher executes all reminder tools.
- [ ] Logical delete is implemented; no physical reminder delete path.
- [ ] Existing tests continue passing; no regressions.

## Completion Report

Create `reports/epic_10_report.md` after completion with:
- Implemented files list.
- Schema diff summary.
- Tool contract summary.
- Test command outputs (`npm test` or targeted suites).
- Known limitations (expected: no real notification scheduling yet).
