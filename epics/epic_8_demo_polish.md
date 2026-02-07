# Epic 8: Demo Polish & Integration

| Field | Value |
|-------|-------|
| **Epic** | 8 |
| **Name** | Demo Polish & Integration |
| **Effort** | 0.5 days |
| **Dependencies** | All previous epics |
| **Predecessors** | Epics 1-7 complete |

---

## Overview

End-to-end integration, activity strip polish, and the canonical "keys" demo scenario. This epic validates the complete flow from user input to AI response with tool execution.

---

## Activity Strip Mapping

Map backend stages to user-friendly messages:

```typescript
// File: src/utils/activityMapping.ts

export const ACTIVITY_LABELS: Record<string, string> = {
  connecting: 'Connecting...',
  preparing_model: 'Preparing...',
  generating: 'Thinking...',
  transcribing_audio: 'Transcribing audio...',
  analyzing_image: 'Analyzing image...',
  searching_memory: 'Searching memory...',
  storing_metadata: 'Storing information...',
  indexing_entities: 'Indexing...',
  finalizing: 'Finalizing response...',
};

export const getActivityLabel = (stage: string): string => {
  return ACTIVITY_LABELS[stage] || stage;
};

// Map tool names to activity messages
export const TOOL_LABELS: Record<string, string> = {
  store_attachment_metadata: 'Storing metadata...',
  store_memory_item: 'Saving to memory...',
  index_entity: 'Indexing entities...',
  search_memory: 'Searching memory...',
  search_attachments: 'Searching attachments...',
  get_attachment_bundle: 'Loading attachment...',
  get_message_with_attachments: 'Loading message...',
  recent_messages: 'Loading context...',
};
```

---

## Demo Scenario: "Where are my keys?"

### Setup Phase

1. User records voice note: "I just put my keys on the kitchen counter next to the coffee maker"
2. Send message with audio attachment
3. Verify ingestion:
   - Transcript metadata stored
   - Entities indexed: "keys", "kitchen counter", "coffee maker"
   - Memory item created: subject="keys", predicate="last_seen", object="kitchen counter next to coffee maker"

### Query Phase

1. User types: "Where are my keys?"
2. Verify retrieval:
   - search_memory called with subject="keys"
   - Memory item found
   - get_attachment_bundle called for source
   - Response cites the voice note

### Expected UI Flow

```
[Activity Strip] Connecting...
[Activity Strip] Thinking...
[Activity Strip] Searching memory...
[Activity Strip] Loading attachment...
[Activity Strip] (hidden)

[Assistant Message]
Based on your voice note from a few minutes ago, you left your 
keys on the kitchen counter next to the coffee maker.

[Evidence Pills]
🎤 Voice Note
```

---

## Integration Test Checklist

### E2E Test: Voice Note Ingestion

```typescript
// Manual test steps
describe('Voice Note Ingestion E2E', () => {
  it('stores and indexes voice note content', async () => {
    // 1. Record audio saying "keys on counter"
    // 2. Send message
    // 3. Wait for final_response
    // 4. Query database:
    //    - attachment_metadata has kind=transcript
    //    - entity_index has entity="keys"
    //    - memory_items has subject="keys"
  });
});
```

### E2E Test: Memory Retrieval

```typescript
describe('Memory Retrieval E2E', () => {
  it('finds and cites stored memory', async () => {
    // 1. Pre-populate memory with test data
    // 2. Send "Where are my keys?"
    // 3. Verify response contains location
    // 4. Verify citations include attachment reference
  });
});
```

---

## Polish Checklist

### UI Polish
- [ ] Activity strip shows during all server stages
- [ ] Streaming tokens render smoothly
- [ ] Evidence pills are tappable
- [ ] Attachment thumbnails load properly
- [ ] Audio player works in messages

### Error Handling
- [ ] Network disconnect shows clear error
- [ ] Tool timeout shows retry option
- [ ] Invalid attachment shows error chip

### Performance
- [ ] Message list scrolls smoothly with 50+ messages
- [ ] Audio recording doesn't block UI
- [ ] Image thumbnails are properly sized

---

## Complete Feature Verification Matrix

| Feature | Epic | Verified |
|---------|------|----------|
| SQLite schema | 1.2 | [ ] |
| File storage | 1.3 | [ ] |
| Device APIs | 1.4 | [ ] |
| Image capture | 2.1 | [ ] |
| Audio capture | 2.1 | [ ] |
| Message list | 2.2 | [ ] |
| Composer | 2.2 | [ ] |
| Attachment chips | 2.3 | [ ] |
| Audio player | 2.3 | [ ] |
| WS connection | 3.1, 4 | [ ] |
| Streaming tokens | 3.3, 4 | [ ] |
| Tool relay | 5 | [ ] |
| Ingestion | 6 | [ ] |
| Retrieval | 7 | [ ] |
| Citations | 7 | [ ] |
| Keys demo | 8 | [ ] |

---

## Launch Configuration

**File: `src/config/env.ts`**

```typescript
export const CONFIG = {
  WS_URL: __DEV__ 
    ? 'ws://localhost:3000/ws' 
    : 'wss://your-production-server.com/ws',
  MAX_ATTACHMENTS: 6,
  MAX_ATTACHMENT_MB: 8,
  TOOL_TIMEOUT_MS: 15000,
};
```

---

## Final Test Specifications

**File: `src/__tests__/e2e/keysDemo.test.ts`**

```typescript
// This is a documentation of manual E2E test steps

describe('Keys Demo Scenario', () => {
  describe('Ingestion Phase', () => {
    test('Record voice note about keys location', () => {
      // Manual: Press mic, say "I put my keys on the dresser", stop
      // Expected: Audio chip appears
    });

    test('Send and verify ingestion', () => {
      // Manual: Press send
      // Expected: Activity strip shows "Transcribing...", "Storing...", etc.
      // Verify: Database has memory_item with subject="keys"
    });
  });

  describe('Retrieval Phase', () => {
    test('Ask about keys location', () => {
      // Manual: Type "Where are my keys?", send
      // Expected: Response mentions "dresser"
      // Expected: Evidence pill appears linking to voice note
    });

    test('Evidence pill opens audio', () => {
      // Manual: Tap evidence pill
      // Expected: Audio player opens/scrolls to message
    });
  });
});
```

---

## Acceptance Criteria

- [ ] Complete "keys" demo works end-to-end
- [ ] Activity strip shows all relevant stages
- [ ] Evidence pills render and are tappable
- [ ] All previous epic tests still pass
- [ ] No console errors during demo flow
- [ ] Performance acceptable on target device

---

## Report Template

Create `reports/epic_8_report.md`:

```markdown
# Epic 8 Completion Report - Demo Polish

## Demo Scenario Results

### Keys Demo
- [ ] Voice note recorded and sent
- [ ] Ingestion completed (transcript, entities, memory)
- [ ] Query returned correct location
- [ ] Citation rendered correctly

## Feature Matrix Status
[Copy from verification matrix with checkmarks]

## Performance Notes
[Device tested, any lag observed]

## Known Issues
[Any remaining bugs or polish items]

## Ready for Demo
[ ] Yes / [ ] No - [reason if no]
```
