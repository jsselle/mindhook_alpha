# Epic 11.2: Reminder Reply Foreground Bridge (MVP-Safe)

| Field | Value |
|---|---|
| Epic | 11.2 |
| Title | Reminder Reply Foreground Bridge (MVP-Safe) |
| Priority | P0 |
| Dependencies | Epic 11.1 |
| Deliverable | Reply action opens chat with reminder context and auto-send once foregrounded |

## Objective

Implement the agreed MVP behavior:
- Notification "Reply" action does not process background LLM call.
- User can type reply text directly in notification UI and tap send there.
- Tapping send opens app/chat and auto-sends that captured text with reminder context when app is foregrounded and ready.

This preserves reliability across iOS/Android and avoids fragile background execution assumptions.

## Scope

### In Scope
- Notification reply text capture payload (typed in notification UI).
- Notification reply send action deep-link payload.
- Chat screen draft prefill and auto-send pipeline.
- Context envelope that tells LLM this is reminder follow-up.
- Event logging in `reminder_events`.

### Out of Scope
- True lock-screen inline text input processing while app remains backgrounded.

## UX Contract

When user taps `Reply` from reminder notification:
1. App opens to existing chat screen.
2. User types reply text in notification UI and taps send.
3. App opens to existing chat screen with the typed text and reminder context payload.
4. Composer is prefilled with:
   - Reminder title/topic.
   - Due timestamp in local format.
   - User-intent hint: "This is in context of reminder `<id>`."
5. App auto-sends this message after DB + WebSocket hooks are ready.
6. Chat shows assistant response in normal thread.

If a platform cannot provide inline typed reply text for some OS/device combination:
- Fallback to opening app with empty reply draft and keep the same foreground auto-send pipeline once user confirms message in app.

## Message Envelope for LLM Context

Prefix injected before user text:

```text
[Reminder Context]
reminder_id: <uuid>
title: <title>
original_due_at: <epoch_ms>
timezone: <iana_tz>
trigger_kind: due
user_reply: <typed_or_empty>

User message:
<typed_or_generated_message>
```

Rules:
- This context is internal prompt material; user-visible bubble should be natural text.
- Keep `reminder_id` in tool-usable context, not in final assistant prose.

## Files and Interfaces

### Notification-to-Chat bridge store

Create `src/notifications/replyBridgeStore.ts`:

```ts
export interface PendingReminderReply {
  id: string; // bridge event id
  reminder_id: string;
  typed_text: string | null; // text typed in notification UI
  notification_action_id: string;
  trigger_kind: 'due';
  created_at: number;
  consumed_at: number | null;
}

export const enqueuePendingReminderReply(...)
export const consumeNextPendingReminderReply(...)
```

Storage options:
- In-memory + persisted fallback in SQLite `reminder_events.payload_json`, or
- dedicated local storage key. Prefer SQLite-backed durability.

### ChatScreen integration

**File: `src/screens/ChatScreen.tsx`**

Add startup effect:
1. On mount/focus, check pending reminder reply.
2. Build composed user text.
3. Insert user message in local `messages`.
4. Execute `runBackend`.
5. Mark pending reply consumed.

Guardrails:
- Exactly-once send: use consumed flag and idempotent consume API.
- If send fails, keep pending entry for retry.

## Algorithm: Exactly-Once Auto-Send

1. Fetch oldest pending item where `consumed_at IS NULL`.
2. Mark as `consumed_at=now` in transaction and return item.
3. Attempt send.
4. If send success -> insert `reply_sent_to_llm` event.
5. If send fails -> set `consumed_at=NULL`, log error event.

This ensures crashes between fetch/send do not permanently drop reply.

## Reminder Update Handling from Reply

LLM may call:
- `update_reminder` with new `due_at`.
- or `cancel_reminder`.

No special path needed beyond Epic 10/11.1 tool pipeline. Ensure prompt guidance exists in Epic 13.

## Tests

### Unit Tests
- `src/notifications/__tests__/replyBridgeStore.test.ts`
- `src/screens/__tests__/ChatScreen.reminderReply.test.tsx` (new)

Required cases:
- Reply action enqueues pending context.
- Typed reply text from notification is preserved end-to-end.
- Chat mount consumes and auto-sends once.
- Failed send rolls back `consumed_at`.
- Duplicate app focus does not duplicate send.
- Typed text absent still generates valid contextual message.

### Integration Tests
- Simulate notification reply event -> pending item created -> chat sends -> reminder event logged `reply_sent_to_llm`.

## Acceptance Criteria

- [ ] User can type reply text in notification UI and tap send from notification.
- [ ] Reply send opens app/deep-links into chat.
- [ ] Contextual draft is generated and auto-sent on foreground readiness.
- [ ] Auto-send is exactly-once under normal/refresh flows.
- [ ] Failure path re-queues pending reply.
- [ ] Reminder events capture reply lifecycle.
- [ ] Existing tests continue passing.

## Completion Report

Create `reports/epic_11_2_report.md` with:
- Reply flow sequence diagram (text or image).
- Foreground timing assumptions.
- Test evidence and known platform caveats.
