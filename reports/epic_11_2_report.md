# Epic 11.2 Report: Reminder Reply Foreground Bridge

## Implemented Files
- `src/notifications/replyBridgeStore.ts`
- `src/notifications/reminderNotificationService.ts`
- `src/notifications/notificationBootstrap.ts`
- `src/notifications/types.ts`
- `src/screens/reminderReplyForegroundBridge.ts`
- `src/screens/ChatScreen.tsx`
- `src/components/ComposerRow.tsx`
- `src/db/schema.ts`
- `src/db/connection.ts`
- `src/db/__tests__/schema.test.ts`
- `src/notifications/__tests__/replyBridgeStore.test.ts`
- `src/notifications/__tests__/reminderNotificationService.test.ts`
- `src/screens/__tests__/ChatScreen.reminderReply.test.tsx`
- `src/notifications/__tests__/reminderReplyFlow.integration.test.ts`

## Reply Flow Sequence Diagram
```text
User taps notification action "Reply (Send)"
  -> expo-notifications response callback fires in app runtime
  -> reminderNotificationService handles REMINDER_ACTION_REPLY
  -> typed text (userText) captured if provided by OS
  -> enqueue pending bridge item in pending_reminder_replies
  -> reminder_events append: reply_requested

App foregrounds ChatScreen
  -> ChatScreen checks bridge store when DB is ready and run loop is idle
  -> consumeNextPendingReminderReply marks one row consumed_at=now (atomic)

If typed text exists:
  -> composer prefill is set (title/due/context + typed text)
  -> user bubble inserted with typed text
  -> backend send uses Reminder Context envelope + natural user message
  -> on success: reminder_events append reply_sent_to_llm
  -> on failure: consumed_at reset to NULL (re-queued), failure event logged

If typed text is absent (platform fallback):
  -> pending row is consumed and manual-confirm mode is entered
  -> user sees in-app hint and types message in composer
  -> on send: backend send uses Reminder Context envelope + typed in-app message
  -> on success: reminder_events append reply_sent_to_llm
  -> on failure: standard chat retry path remains available
```

## Foreground Timing Assumptions
- Notification callbacks are registered at app bootstrap (`app/_layout.tsx`).
- Bridge processing starts only after:
  - SQLite init is complete (`dbReady=true`), and
  - WebSocket state is not `connecting`/`running`.
- Bridge processing runs on focus and idle transitions to avoid duplicate sends.
- Queue consumption is exactly-once per attempt using transaction + `consumed_at`.

## Test Evidence
Executed:
```bash
npx jest --runInBand src/screens/__tests__/ChatScreen.reminderReply.test.tsx src/notifications/__tests__/reminderNotificationService.test.ts src/notifications/__tests__/notificationBootstrap.test.ts src/notifications/__tests__/replyBridgeStore.test.ts src/notifications/__tests__/reminderReplyFlow.integration.test.ts src/db/__tests__/schema.test.ts src/db/__tests__/connection.test.ts
```

Result:
- 7 test suites passed
- 31 tests passed
- 0 failures

Coverage highlights:
- Pending reply enqueue/consume/release semantics
- Notification reply text capture and reply event logging
- Manual-confirm fallback when inline typed text is unavailable
- Duplicate-send prevention behavior through consume-once flow
- Integration-style chain: notification reply -> bridge consume -> send -> `reply_sent_to_llm`

## Platform Caveats
- `userText` availability depends on OS/device/notification surface; fallback path is implemented.
- `opensAppToForeground` and text input action behavior can vary by OS version and OEM customizations.
- Current deep-link payload is included in notification data (`deep_link`), but routing currently relies on app foregrounding into the default chat route.
