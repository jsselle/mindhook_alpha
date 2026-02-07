# Epic 3.3: Run Loop State Machine - Implementation Report

| Field | Value |
|-------|-------|
| **Epic** | 3.3 |
| **Status** | ✅ Complete |
| **Date** | 2026-02-06 |

---

## Summary

Implemented the deterministic run loop state machine that orchestrates WebSocket message flow, Gemini streaming, and tool call relay.

---

## Files Created/Modified

### New Files

| File | Purpose |
|------|---------|
| [`runManager.ts`](file:///c:/Users/asd/Documents/git/brain-app/backend_server/src/ws/runManager.ts) | Run loop state machine implementation |
| [`runManager.test.ts`](file:///c:/Users/asd/Documents/git/brain-app/backend_server/__tests__/runManager.test.ts) | Comprehensive unit tests |

### Modified Files

| File | Changes |
|------|---------|
| [`handler.ts`](file:///c:/Users/asd/Documents/git/brain-app/backend_server/src/ws/handler.ts) | Simplified to use RunManager |
| [`jest.config.js`](file:///c:/Users/asd/Documents/git/brain-app/backend_server/jest.config.js) | Added transformIgnorePatterns for uuid |

---

## Implementation Details

### State Machine

The `RunManager` class implements all six states as defined:

```
WAIT_RUN_START → PREPARE_MODEL → STREAM_OUTPUT → HANDLE_TOOL_CALL ⟷
                                       ↓                    ↓
                                  FINALIZE → CLOSE     (on timeout/error)
```

### Key Features

- **Protocol Validation**: Rejects invalid protocol versions and message types
- **Payload Validation**: Enforces attachment limits (6 max, 8MB each, 20MB total)
- **MIME Validation**: Only allows allowed media types
- **Tool Call Relay**: Forwards tool calls to client with 15s timeout
- **Tool Result Handling**: Resolves promises when results come back
- **Cleanup**: Properly cleans up pending tool calls on close
- **Final Response**: Includes tool call summary (calls/errors)

---

## Test Results

```
Test Suites: 3 passed, 3 total
Tests:       26 passed, 26 total
```

### Test Coverage

- ✅ Rejects invalid protocol version
- ✅ Validates run_start payload (too many attachments)
- ✅ Rejects duplicate run_start
- ✅ Rejects invalid JSON
- ✅ Rejects unknown message type
- ✅ Sends status updates when run starts
- ✅ Sends final_response with tool_summary on completion
- ✅ Cleans up pending tool calls on connection close
- ✅ Validates unsupported MIME types

---

## Acceptance Criteria

- [x] State machine transitions correctly through all states
- [x] Duplicate run_start rejected after first
- [x] Tool calls relayed to client with timeout
- [x] Tool results resume generation
- [x] Tool timeout sends error and closes
- [x] final_response includes tool summary
- [x] All tests pass
