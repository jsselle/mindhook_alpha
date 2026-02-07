# Epic 5: Tool Bridge System

| Field | Value |
|-------|-------|
| **Epic** | 5 |
| **Name** | Tool Bridge System |
| **Effort** | 1 day |
| **Dependencies** | Epic 1.4, 3.2, 4 |
| **Predecessors** | Device APIs, Gemini integration, WS client |

---

## Overview

Implement the complete tool bridge: 8 tool definitions for Gemini, frontend tool dispatcher, and all execution handlers. Tools enable Gemini to read/write device data.

---

## Tool Schemas (Gemini Function Declarations)

**File: `backend_server/src/tools/definitions.ts`**

```typescript
import { FunctionDeclaration } from '@google/generative-ai';

export const getToolDefinitions = (): FunctionDeclaration[] => [
  // WRITE TOOLS
  {
    name: 'store_attachment_metadata',
    description: 'Persist LLM-generated metadata for an attachment on device',
    parameters: {
      type: 'object',
      properties: {
        metadata_id: { type: 'string', description: 'UUID for this metadata record' },
        attachment_id: { type: 'string', description: 'UUID of the attachment' },
        model: { type: 'string', description: 'Model that generated this metadata' },
        kind: {
          type: 'string',
          enum: ['transcript', 'scene', 'entities', 'summary', 'claims'],
          description: 'Type of metadata',
        },
        payload: { type: 'object', description: 'Metadata content' },
        created_at: { type: 'integer', description: 'Unix epoch ms' },
        schema_version: { type: 'string', enum: ['1'] },
      },
      required: ['metadata_id', 'attachment_id', 'model', 'kind', 'payload', 'created_at', 'schema_version'],
    },
  },
  {
    name: 'store_memory_item',
    description: 'Store a durable memory fact on device (SPO triple)',
    parameters: {
      type: 'object',
      properties: {
        memory_item_id: { type: 'string' },
        type: {
          type: 'string',
          enum: ['object_location', 'habit', 'event', 'fact'],
        },
        subject: { type: 'string' },
        predicate: { type: 'string' },
        object: { type: 'string' },
        time_anchor: { type: 'integer', nullable: true },
        confidence: { type: 'number', description: '0.0 to 1.0' },
        source_attachment_id: { type: 'string', nullable: true },
        source_message_id: { type: 'string', nullable: true },
        created_at: { type: 'integer' },
        schema_version: { type: 'string', enum: ['1'] },
      },
      required: ['memory_item_id', 'type', 'subject', 'predicate', 'object', 'confidence', 'created_at', 'schema_version'],
    },
  },
  {
    name: 'index_entity',
    description: 'Index an entity for fast device-side lookup',
    parameters: {
      type: 'object',
      properties: {
        entity_index_id: { type: 'string' },
        entity: { type: 'string', description: 'Normalized entity name' },
        source_type: { type: 'string', enum: ['attachment', 'memory', 'message'] },
        source_id: { type: 'string' },
        weight: { type: 'number', description: 'Relevance weight 0-1' },
        created_at: { type: 'integer' },
        schema_version: { type: 'string', enum: ['1'] },
      },
      required: ['entity_index_id', 'entity', 'source_type', 'source_id', 'weight', 'created_at', 'schema_version'],
    },
  },

  // READ TOOLS
  {
    name: 'search_memory',
    description: 'Search memory_items using structured filters',
    parameters: {
      type: 'object',
      properties: {
        subject: { type: 'string', nullable: true },
        type: {
          type: 'string',
          enum: ['object_location', 'habit', 'event', 'fact'],
          nullable: true,
        },
        recent_days: { type: 'integer', nullable: true },
        limit: { type: 'integer' },
        schema_version: { type: 'string', enum: ['1'] },
      },
      required: ['limit', 'schema_version'],
    },
  },
  {
    name: 'search_attachments',
    description: 'Find attachments by indexed entities and optional filters',
    parameters: {
      type: 'object',
      properties: {
        entities: { type: 'array', items: { type: 'string' } },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['image', 'audio', 'video', 'file'] },
          nullable: true,
        },
        recent_days: { type: 'integer', nullable: true },
        limit: { type: 'integer' },
        schema_version: { type: 'string', enum: ['1'] },
      },
      required: ['entities', 'limit', 'schema_version'],
    },
  },
  {
    name: 'get_attachment_bundle',
    description: 'Return attachment row + all metadata kinds for it',
    parameters: {
      type: 'object',
      properties: {
        attachment_id: { type: 'string' },
        schema_version: { type: 'string', enum: ['1'] },
      },
      required: ['attachment_id', 'schema_version'],
    },
  },
  {
    name: 'recent_messages',
    description: 'Return recent messages for context',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        schema_version: { type: 'string', enum: ['1'] },
      },
      required: ['limit', 'schema_version'],
    },
  },
  {
    name: 'get_message_with_attachments',
    description: 'Return a message with its linked attachments',
    parameters: {
      type: 'object',
      properties: {
        message_id: { type: 'string' },
        schema_version: { type: 'string', enum: ['1'] },
      },
      required: ['message_id', 'schema_version'],
    },
  },
];
```

---

## Frontend Tool Dispatcher

**File: `src/tools/dispatcher.ts`**

```typescript
import {
  insertAttachmentMetadata,
  insertMemoryItem,
  insertEntityIndex,
} from '../api/deviceWriteApi';
import {
  searchMemory,
  searchAttachments,
  getAttachmentBundle,
  getRecentMessages,
  getMessageWithAttachments,
} from '../api/deviceReadApi';
import { MemoryItemRow, EntityIndexRow, MetadataKind, MemoryType, AttachmentType } from '../types/domain';

// Error codes for tool execution
export const TOOL_ERROR_CODES = {
  INVALID_ARGS: 'INVALID_ARGS',
  UNKNOWN_TOOL: 'UNKNOWN_TOOL',
  SQLITE_CONSTRAINT: 'SQLITE_CONSTRAINT',
  SQLITE_IO: 'SQLITE_IO',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export class ToolError extends Error {
  code: string;
  retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

// Main dispatcher function
export const executeToolCall = async (
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> => {
  // Validate schema version
  if (args.schema_version !== '1') {
    throw new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, `Unsupported schema_version: ${args.schema_version}`);
  }

  switch (toolName) {
    case 'store_attachment_metadata':
      return handleStoreAttachmentMetadata(args);
    case 'store_memory_item':
      return handleStoreMemoryItem(args);
    case 'index_entity':
      return handleIndexEntity(args);
    case 'search_memory':
      return handleSearchMemory(args);
    case 'search_attachments':
      return handleSearchAttachments(args);
    case 'get_attachment_bundle':
      return handleGetAttachmentBundle(args);
    case 'recent_messages':
      return handleRecentMessages(args);
    case 'get_message_with_attachments':
      return handleGetMessageWithAttachments(args);
    default:
      throw new ToolError(TOOL_ERROR_CODES.UNKNOWN_TOOL, `Unknown tool: ${toolName}`);
  }
};

// Tool handlers
async function handleStoreAttachmentMetadata(args: Record<string, unknown>) {
  await insertAttachmentMetadata({
    id: args.metadata_id as string,
    attachment_id: args.attachment_id as string,
    model: args.model as string,
    kind: args.kind as MetadataKind,
    payload: args.payload,
    created_at: args.created_at as number,
  });
  return { metadata_id: args.metadata_id };
}

async function handleStoreMemoryItem(args: Record<string, unknown>) {
  const row: MemoryItemRow = {
    id: args.memory_item_id as string,
    type: args.type as MemoryType,
    subject: args.subject as string,
    predicate: args.predicate as string,
    object: args.object as string,
    time_anchor: (args.time_anchor as number) ?? null,
    confidence: args.confidence as number,
    source_attachment_id: (args.source_attachment_id as string) ?? null,
    source_message_id: (args.source_message_id as string) ?? null,
    created_at: args.created_at as number,
  };
  await insertMemoryItem(row);
  return { memory_item_id: args.memory_item_id };
}

async function handleIndexEntity(args: Record<string, unknown>) {
  const row: EntityIndexRow = {
    id: args.entity_index_id as string,
    entity: args.entity as string,
    source_type: args.source_type as 'attachment' | 'memory' | 'message',
    source_id: args.source_id as string,
    weight: args.weight as number,
    created_at: args.created_at as number,
  };
  await insertEntityIndex(row);
  return { entity_index_id: args.entity_index_id };
}

async function handleSearchMemory(args: Record<string, unknown>) {
  const items = await searchMemory({
    subject: (args.subject as string) ?? null,
    type: (args.type as MemoryType) ?? null,
    recent_days: (args.recent_days as number) ?? null,
    limit: args.limit as number,
  });
  return { items };
}

async function handleSearchAttachments(args: Record<string, unknown>) {
  const attachments = await searchAttachments({
    entities: args.entities as string[],
    types: (args.types as AttachmentType[]) ?? null,
    recent_days: (args.recent_days as number) ?? null,
    limit: args.limit as number,
  });
  return { attachments };
}

async function handleGetAttachmentBundle(args: Record<string, unknown>) {
  const bundle = await getAttachmentBundle({
    attachment_id: args.attachment_id as string,
  });
  if (!bundle) {
    throw new ToolError(TOOL_ERROR_CODES.FILE_NOT_FOUND, 'Attachment not found');
  }
  return bundle;
}

async function handleRecentMessages(args: Record<string, unknown>) {
  const messages = await getRecentMessages({
    limit: args.limit as number,
  });
  return { messages };
}

async function handleGetMessageWithAttachments(args: Record<string, unknown>) {
  const result = await getMessageWithAttachments({
    message_id: args.message_id as string,
  });
  if (!result) {
    throw new ToolError(TOOL_ERROR_CODES.FILE_NOT_FOUND, 'Message not found');
  }
  return result;
}
```

---

## Test Specifications

**File: `src/tools/__tests__/dispatcher.test.ts`**

```typescript
import { executeToolCall, ToolError, TOOL_ERROR_CODES } from '../dispatcher';

// Mock the API modules
jest.mock('../../api/deviceWriteApi');
jest.mock('../../api/deviceReadApi');
jest.mock('expo-sqlite');

import * as writeApi from '../../api/deviceWriteApi';
import * as readApi from '../../api/deviceReadApi';

describe('Tool Dispatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('schema_version validation', () => {
    it('rejects unsupported schema version', async () => {
      await expect(
        executeToolCall('search_memory', { schema_version: '2', limit: 10 })
      ).rejects.toThrow('Unsupported schema_version');
    });
  });

  describe('unknown tool', () => {
    it('throws UNKNOWN_TOOL error', async () => {
      await expect(
        executeToolCall('nonexistent_tool', { schema_version: '1' })
      ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.UNKNOWN_TOOL });
    });
  });

  describe('store_attachment_metadata', () => {
    it('calls insertAttachmentMetadata with correct args', async () => {
      const args = {
        metadata_id: 'meta-1',
        attachment_id: 'att-1',
        model: 'gemini-3',
        kind: 'transcript',
        payload: { text: 'hello' },
        created_at: 1700000000000,
        schema_version: '1',
      };

      await executeToolCall('store_attachment_metadata', args);

      expect(writeApi.insertAttachmentMetadata).toHaveBeenCalledWith({
        id: 'meta-1',
        attachment_id: 'att-1',
        model: 'gemini-3',
        kind: 'transcript',
        payload: { text: 'hello' },
        created_at: 1700000000000,
      });
    });
  });

  describe('search_memory', () => {
    it('calls searchMemory and returns items', async () => {
      (readApi.searchMemory as jest.Mock).mockResolvedValue([
        { id: 'm1', subject: 'keys', predicate: 'last_seen', object: 'kitchen' },
      ]);

      const result = await executeToolCall('search_memory', {
        subject: 'keys',
        limit: 5,
        schema_version: '1',
      });

      expect(result).toEqual({
        items: [{ id: 'm1', subject: 'keys', predicate: 'last_seen', object: 'kitchen' }],
      });
    });
  });

  describe('get_attachment_bundle', () => {
    it('throws FILE_NOT_FOUND for missing attachment', async () => {
      (readApi.getAttachmentBundle as jest.Mock).mockResolvedValue(null);

      await expect(
        executeToolCall('get_attachment_bundle', { attachment_id: 'missing', schema_version: '1' })
      ).rejects.toMatchObject({ code: TOOL_ERROR_CODES.FILE_NOT_FOUND });
    });
  });
});
```

---

## Acceptance Criteria

- [ ] All 8 tools defined with complete JSON schemas
- [ ] Tool dispatcher routes to correct handler
- [ ] Schema version '1' required for all tools
- [ ] Unknown tools return UNKNOWN_TOOL error
- [ ] Write tools call DeviceWriteAPI correctly
- [ ] Read tools call DeviceReadAPI correctly
- [ ] All operations are idempotent
- [ ] All tests pass

---

## Report Template

Create `reports/epic_5_report.md` after completion.
