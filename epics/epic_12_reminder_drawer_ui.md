# Epic 12: Chat-Screen Reminder Drawer UI

| Field | Value |
|---|---|
| Epic | 12 |
| Title | Chat-Screen Reminder Drawer UI |
| Priority | P0 |
| Dependencies | Epics 10, 11.1, 11.2 |
| Deliverable | Notification button + swipe-open drawer listing scheduled reminders with edit/delete actions |

## Objective

Keep single-screen app architecture while adding reminder management UI:
- Top-left notification button on chat screen.
- Drawer opens via button or left-to-right gesture.
- List scheduled reminders sorted earliest first.
- Each entry supports date edit and logical delete.

Delete must cancel local alarms and perform logical DB delete only.

## UX Requirements

### Entry Points
- Header left button icon (bell/reminder icon) opens drawer.
- Left edge swipe gesture (`left -> right`) opens drawer.

### Drawer Content
- Title: `Reminders`.
- List only active reminders by default (`scheduled`, `snoozed`, optionally `triggered` if not resolved yet).
- Sort: `due_at ASC`, then `created_at ASC`.
- Each row displays:
  - title
  - due local date/time
  - status pill
  - actions: `Edit date`, `Delete`

### Edit Date Flow
- Inline date/time picker modal.
- On save:
  - Call tool dispatcher path equivalent to `update_reminder` semantics.
  - Reschedule notifications.
  - Update list optimistically with rollback on failure.

### Delete Flow
- Confirmation dialog required.
- On confirm:
  - Execute logical delete (`status='deleted'`, timestamps set).
  - Cancel due/pre notifications.
  - Remove from active list.

## Technical Design

### Files
- `src/components/ReminderDrawer.tsx` (new)
- `src/components/ReminderListItem.tsx` (new)
- `src/hooks/useReminderDrawer.ts` (new)
- `src/screens/ChatScreen.tsx` (update)
- `src/api/deviceReadApi.ts` and `src/api/deviceWriteApi.ts` (minor additions if needed)

### Suggested State Contract

```ts
interface ReminderDrawerState {
  visible: boolean;
  reminders: ReminderRow[];
  loading: boolean;
  error: string | null;
}
```

### Gesture Contract

Use `react-native-gesture-handler` pan gesture:
- Trigger open if:
  - gesture starts within left-edge threshold (<= 24px), and
  - horizontal delta > 56px, and
  - abs(deltaX) > abs(deltaY).

Avoid conflict with message list scroll by requiring left-edge start.

### Data Access Contract

Use read API call:

```ts
listReminders({
  statuses: ['scheduled', 'snoozed', 'triggered'],
  include_deleted: false,
  limit: 200,
  offset: 0
})
```

### Edit/Delete Action Contracts

On edit date save:
1. Validate new date in future.
2. Update reminder row (`due_at`, maybe `status='scheduled'` if previously triggered).
3. Reschedule notifications.
4. Insert event `updated`.

On delete:
1. Call logical delete API.
2. Cancel notifications.
3. Insert event `deleted`.

## Algorithms

### Sorting

Stable sort key:
1. `due_at` ascending.
2. `created_at` ascending.
3. `id` ascending as tie-breaker.

### Optimistic Mutation with Rollback

1. Snapshot current list.
2. Apply local optimistic mutation.
3. Execute async write + schedule/cancel.
4. If fail, restore snapshot and show toast/inline error.

## Accessibility

- Bell button must include `accessibilityLabel="Open reminders drawer"`.
- Drawer close affordance accessible by button and backdrop tap.
- Action buttons:
  - `accessibilityLabel="Edit reminder date"`
  - `accessibilityLabel="Delete reminder"`

## Tests

### Component Tests
- `src/components/__tests__/ReminderDrawer.test.tsx`
- `src/components/__tests__/ReminderListItem.test.tsx`

Required cases:
- Drawer opens by button tap.
- Drawer opens by edge swipe gesture.
- List renders sorted by earliest due first.
- Delete action prompts confirmation and removes item from active list.
- Edit date updates row and re-sorts list.
- Error state rendering on failed load/mutation.

### Hook/Integration Tests
- `src/hooks/__tests__/useReminderDrawer.test.ts`
- Add ChatScreen integration assertions in `src/screens/__tests__/ChatScreen.test.tsx` (or create new file).

## Acceptance Criteria

- [ ] Notification button at top-left opens reminder drawer.
- [ ] Left-edge swipe opens drawer without breaking chat scroll.
- [ ] Drawer lists active reminders sorted earliest first.
- [ ] Each reminder supports edit date and logical delete.
- [ ] Delete cancels notifications and preserves DB row (status `deleted`).
- [ ] UI is still single-screen chat architecture.
- [ ] All prior test suites remain passing.

## Completion Report

Create `reports/epic_12_report.md` with:
- UI screenshots (drawer closed/open, edit flow, delete flow).
- Gesture behavior notes.
- Test coverage summary.
