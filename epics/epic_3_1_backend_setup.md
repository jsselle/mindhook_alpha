# Epic 3.1: Backend Project Setup & WebSocket Server

| Field | Value |
|-------|-------|
| **Epic** | 3.1 |
| **Name** | Backend Project Setup & WebSocket Server |
| **Effort** | 0.5 days |
| **Dependencies** | None (parallel with frontend) |
| **Predecessors** | None |

---

## Overview

Set up the Node.js backend project with Fastify and WebSocket support. Implement the base WebSocket server with protocol envelope validation.

---

## Project Structure

```
backend_server/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # Fastify server setup
│   ├── ws/
│   │   ├── handler.ts        # WebSocket connection handler
│   │   ├── protocol.ts       # Message types & validation
│   │   └── runManager.ts     # Run state machine
│   ├── gemini/
│   │   └── client.ts         # Gemini API wrapper
│   ├── tools/
│   │   └── definitions.ts    # Tool schemas
│   └── types/
│       └── messages.ts       # TypeScript types
├── __tests__/
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

## Setup Commands

```bash
cd backend_server

# Initialize project
npm init -y

# Install dependencies
npm install fastify @fastify/websocket @google/generative-ai uuid

# Install dev dependencies
npm install -D typescript @types/node @types/ws ts-node-dev jest @types/jest ts-jest

# Initialize TypeScript
npx tsc --init
```

---

## Configuration Files

**File: `backend_server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "__tests__"]
}
```

**File: `backend_server/package.json`** (scripts section)

```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch"
  }
}
```

**File: `backend_server/jest.config.js`**

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
};
```

---

## Implementation

### Message Types

**File: `backend_server/src/types/messages.ts`**

```typescript
// Protocol version
export const PROTOCOL_VERSION = '1.0';

// Base envelope (all messages)
export interface MessageEnvelope {
  protocol_version: string;
  app_version: string;
  type: string;
  run_id: string;
  seq: number;
}

// Client -> Server: run_start
export interface RunStartMessage extends MessageEnvelope {
  type: 'run_start';
  user: {
    message_id: string;
    text: string;
    created_at: number;
  };
  attachments: AttachmentPayload[];
  context: {
    recent_message_count: number;
  };
}

export interface AttachmentPayload {
  attachment_id: string;
  type: 'image' | 'audio' | 'video' | 'file';
  mime: string;
  base64: string;
  duration_ms?: number;
  width?: number;
  height?: number;
  sha256?: string;
  byte_length: number;
}

// Server -> Client: assistant_token
export interface AssistantTokenMessage extends MessageEnvelope {
  type: 'assistant_token';
  text: string;
}

// Server -> Client: status
export interface StatusMessage extends MessageEnvelope {
  type: 'status';
  stage: string;
  detail?: string;
}

// Server -> Client: tool_call
export interface ToolCallMessage extends MessageEnvelope {
  type: 'tool_call';
  call_id: string;
  tool: string;
  args: Record<string, unknown>;
  expects_result: boolean;
  timeout_ms: number;
}

// Client -> Server: tool_result
export interface ToolResultMessage extends MessageEnvelope {
  type: 'tool_result';
  call_id: string;
  tool: string;
  result: {
    ok: true;
    data?: unknown;
  };
}

// Client -> Server: tool_error
export interface ToolErrorMessage extends MessageEnvelope {
  type: 'tool_error';
  call_id: string;
  tool: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

// Server -> Client: final_response
export interface FinalResponseMessage extends MessageEnvelope {
  type: 'final_response';
  message: {
    message_id: string;
    role: 'assistant';
    text: string;
    created_at: number;
  };
  citations: Citation[];
  tool_summary: {
    calls: number;
    errors: number;
  };
}

export interface Citation {
  kind: 'attachment' | 'message' | 'memory';
  attachment_id?: string;
  message_id?: string;
  memory_item_id?: string;
  metadata_kind?: string;
  note?: string;
}

// Server -> Client: run_error
export interface RunErrorMessage extends MessageEnvelope {
  type: 'run_error';
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

// Error codes
export const ERROR_CODES = {
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL',
  UNSUPPORTED_MIME: 'UNSUPPORTED_MIME',
  MODEL_UPSTREAM_ERROR: 'MODEL_UPSTREAM_ERROR',
  TOOL_TIMEOUT: 'TOOL_TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
```

### Protocol Validation

**File: `backend_server/src/ws/protocol.ts`**

```typescript
import { PROTOCOL_VERSION, RunStartMessage, ERROR_CODES } from '../types/messages';

// Limits
export const MAX_ATTACHMENTS_PER_RUN = 6;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_TOTAL_RUN_BYTES = 20 * 1024 * 1024; // 20 MB

// MIME allowlist
export const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/webm',
  'video/mp4',
  'video/webm',
]);

export interface ValidationResult {
  valid: boolean;
  error?: { code: string; message: string };
}

export const validateEnvelope = (msg: unknown): ValidationResult => {
  if (!msg || typeof msg !== 'object') {
    return { valid: false, error: { code: ERROR_CODES.INVALID_MESSAGE, message: 'Invalid JSON' } };
  }

  const envelope = msg as Record<string, unknown>;

  if (envelope.protocol_version !== PROTOCOL_VERSION) {
    return {
      valid: false,
      error: {
        code: ERROR_CODES.UNSUPPORTED_PROTOCOL,
        message: `Unsupported protocol version: ${envelope.protocol_version}`,
      },
    };
  }

  if (!envelope.type || !envelope.run_id || typeof envelope.seq !== 'number') {
    return { valid: false, error: { code: ERROR_CODES.INVALID_MESSAGE, message: 'Missing required fields' } };
  }

  return { valid: true };
};

export const validateRunStart = (msg: RunStartMessage): ValidationResult => {
  // Check attachment count
  if (msg.attachments.length > MAX_ATTACHMENTS_PER_RUN) {
    return {
      valid: false,
      error: {
        code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: `Too many attachments: ${msg.attachments.length} > ${MAX_ATTACHMENTS_PER_RUN}`,
      },
    };
  }

  let totalBytes = 0;
  for (const att of msg.attachments) {
    // Check individual size
    if (att.byte_length > MAX_ATTACHMENT_BYTES) {
      return {
        valid: false,
        error: {
          code: ERROR_CODES.PAYLOAD_TOO_LARGE,
          message: `Attachment ${att.attachment_id} too large: ${att.byte_length}`,
        },
      };
    }

    // Check MIME
    if (!ALLOWED_MIMES.has(att.mime)) {
      return {
        valid: false,
        error: {
          code: ERROR_CODES.UNSUPPORTED_MIME,
          message: `Unsupported MIME type: ${att.mime}`,
        },
      };
    }

    totalBytes += att.byte_length;
  }

  if (totalBytes > MAX_TOTAL_RUN_BYTES) {
    return {
      valid: false,
      error: {
        code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: `Total payload too large: ${totalBytes}`,
      },
    };
  }

  return { valid: true };
};
```

### Server Setup

**File: `backend_server/src/server.ts`**

```typescript
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { handleConnection } from './ws/handler';

export const createServer = async () => {
  const fastify = Fastify({ logger: true });

  await fastify.register(websocket);

  fastify.get('/ws', { websocket: true }, (socket, req) => {
    handleConnection(socket, req);
  });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  return fastify;
};
```

**File: `backend_server/src/index.ts`**

```typescript
import { createServer } from './server';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const start = async () => {
  const server = await createServer();
  
  try {
    await server.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Server running on port ${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
```

---

## Test Specifications

**File: `backend_server/__tests__/protocol.test.ts`**

```typescript
import { validateEnvelope, validateRunStart, ALLOWED_MIMES } from '../src/ws/protocol';

describe('Protocol Validation', () => {
  describe('validateEnvelope', () => {
    it('accepts valid envelope', () => {
      const result = validateEnvelope({
        protocol_version: '1.0',
        app_version: '1.0.0',
        type: 'run_start',
        run_id: 'abc-123',
        seq: 1,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects unsupported protocol version', () => {
      const result = validateEnvelope({
        protocol_version: '2.0',
        type: 'run_start',
        run_id: 'abc',
        seq: 1,
      });
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_PROTOCOL');
    });
  });

  describe('validateRunStart', () => {
    const validMsg = {
      protocol_version: '1.0',
      app_version: '1.0.0',
      type: 'run_start' as const,
      run_id: 'run-1',
      seq: 1,
      user: { message_id: 'm1', text: 'hello', created_at: Date.now() },
      attachments: [],
      context: { recent_message_count: 0 },
    };

    it('accepts valid run_start', () => {
      expect(validateRunStart(validMsg).valid).toBe(true);
    });

    it('rejects too many attachments', () => {
      const msg = {
        ...validMsg,
        attachments: Array(10).fill({
          attachment_id: 'a1',
          type: 'image',
          mime: 'image/jpeg',
          base64: '',
          byte_length: 1000,
        }),
      };
      const result = validateRunStart(msg);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });
});
```

---

## Acceptance Criteria

- [ ] Backend project initialized with TypeScript
- [ ] Fastify server starts on configurable port
- [ ] WebSocket endpoint at `/ws` accepts connections
- [ ] Protocol version validated on first message
- [ ] Invalid messages rejected with structured error
- [ ] Size limits enforced per attachment and total
- [ ] All tests pass

---

## Report Template

Create `reports/epic_3_1_report.md` after completion.
