# Epic 1.4: Device APIs (Read & Write)

| Field | Value |
|-------|-------|
| **Epic** | 1.4 |
| **Name** | Device APIs (Read & Write) |
| **Effort** | 1 day |
| **Dependencies** | Epic 1.1, 1.2, 1.3 |
| **Predecessors** | Types, database, file storage |

---

## Overview

Implement the complete DeviceWriteAPI and DeviceReadAPI interfaces that provide CRUD operations for all database tables. These APIs are the **only** interface for data access, used directly by the tool dispatcher.

---

## API Contracts

### DeviceWriteAPI Interface

```typescript
// File: src/api/deviceWriteApi.ts

import { 
  MessageRow, AttachmentRow, MetadataKind, 
  MemoryItemRow, EntityIndexRow 
} from '../types/domain';

export interface DeviceWriteAPI {
  // Message operations (UPSERT by id)
  insertMessage(row: MessageRow): Promise<void>;
  
  // Attachment operations (UPSERT by id)
  insertAttachment(row: AttachmentRow): Promise<void>;
  
  // Link message to attachment
  linkMessageAttachment(args: {
    message_id: string;
    attachment_id: string;
    position?: number | null;
  }): Promise<void>;
  
  // Store AI-generated metadata
  insertAttachmentMetadata(args: {
    id: string;
    attachment_id: string;
    model: string;
    kind: MetadataKind;
    payload: unknown;
    created_at: number;
  }): Promise<void>;
  
  // Store memory fact
  insertMemoryItem(row: MemoryItemRow): Promise<void>;
  
  // Store entity index entry
  insertEntityIndex(row: EntityIndexRow): Promise<void>;
}
```

### DeviceReadAPI Interface

```typescript
// File: src/api/deviceReadApi.ts

import {
  MessageRow, AttachmentRow, MemoryItemRow,
  MemoryType, AttachmentType, MetadataKind
} from '../types/domain';

export interface AttachmentBundle {
  attachment: AttachmentRow;
  metadata: Array<{
    kind: MetadataKind;
    model: string;
    created_at: number;
    payload: unknown;
  }>;
}

export interface MessageWithAttachments {
  message: MessageRow;
  attachments: AttachmentRow[];
}

export interface DeviceReadAPI {
  // Search memory items with filters
  searchMemory(args: {
    subject?: string | null;
    type?: MemoryType | null;
    recent_days?: number | null;
    limit: number;
  }): Promise<MemoryItemRow[]>;
  
  // Search attachments via entity index
  searchAttachments(args: {
    entities: string[];
    types?: AttachmentType[] | null;
    recent_days?: number | null;
    limit: number;
  }): Promise<AttachmentRow[]>;
  
  // Get attachment with all metadata
  getAttachmentBundle(args: {
    attachment_id: string;
  }): Promise<AttachmentBundle | null>;
  
  // Get message with linked attachments
  getMessageWithAttachments(args: {
    message_id: string;
  }): Promise<MessageWithAttachments | null>;
  
  // Get recent messages for context
  getRecentMessages(args: {
    limit: number;
  }): Promise<Array<{ id: string; role: string; text: string | null; created_at: number }>>;
}
```

---

## Implementation

**File: `src/api/deviceWriteApi.ts`**

```typescript
import { getDatabase } from '../db/connection';
import {
  MessageRow, AttachmentRow, MetadataKind,
  MemoryItemRow, EntityIndexRow
} from '../types/domain';

export const insertMessage = async (row: MessageRow): Promise<void> => {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO messages (id, role, text, created_at) VALUES (?, ?, ?, ?)`,
    [row.id, row.role, row.text, row.created_at]
  );
};

export const insertAttachment = async (row: AttachmentRow): Promise<void> => {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO attachments 
     (id, type, mime, local_path, size_bytes, duration_ms, width, height, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.type, row.mime, row.local_path, 
     row.size_bytes, row.duration_ms, row.width, row.height, row.created_at]
  );
};

export const linkMessageAttachment = async (args: {
  message_id: string;
  attachment_id: string;
  position?: number | null;
}): Promise<void> => {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO message_attachments (message_id, attachment_id, position) 
     VALUES (?, ?, ?)`,
    [args.message_id, args.attachment_id, args.position ?? null]
  );
};

export const insertAttachmentMetadata = async (args: {
  id: string;
  attachment_id: string;
  model: string;
  kind: MetadataKind;
  payload: unknown;
  created_at: number;
}): Promise<void> => {
  const db = getDatabase();
  const payloadJson = JSON.stringify(args.payload);
  await db.runAsync(
    `INSERT OR REPLACE INTO attachment_metadata 
     (id, attachment_id, model, kind, payload_json, created_at) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [args.id, args.attachment_id, args.model, args.kind, payloadJson, args.created_at]
  );
};

export const insertMemoryItem = async (row: MemoryItemRow): Promise<void> => {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO memory_items 
     (id, type, subject, predicate, object, time_anchor, confidence, 
      source_attachment_id, source_message_id, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.type, row.subject, row.predicate, row.object,
     row.time_anchor, row.confidence, row.source_attachment_id,
     row.source_message_id, row.created_at]
  );
};

export const insertEntityIndex = async (row: EntityIndexRow): Promise<void> => {
  const db = getDatabase();
  await db.runAsync(
    `INSERT OR REPLACE INTO entity_index 
     (id, entity, source_type, source_id, weight, created_at) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [row.id, row.entity, row.source_type, row.source_id, row.weight, row.created_at]
  );
};
```

**File: `src/api/deviceReadApi.ts`**

```typescript
import { getDatabase } from '../db/connection';
import {
  MessageRow, AttachmentRow, MemoryItemRow,
  MemoryType, AttachmentType, MetadataKind
} from '../types/domain';
import { nowMs } from '../utils/time';

export interface AttachmentBundle {
  attachment: AttachmentRow;
  metadata: Array<{
    kind: MetadataKind;
    model: string;
    created_at: number;
    payload: unknown;
  }>;
}

export const searchMemory = async (args: {
  subject?: string | null;
  type?: MemoryType | null;
  recent_days?: number | null;
  limit: number;
}): Promise<MemoryItemRow[]> => {
  const db = getDatabase();
  
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  
  if (args.subject) {
    conditions.push('subject = ?');
    params.push(args.subject);
  }
  if (args.type) {
    conditions.push('type = ?');
    params.push(args.type);
  }
  if (args.recent_days) {
    conditions.push('created_at >= ?');
    params.push(nowMs() - args.recent_days * 86400000);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  const rows = await db.getAllAsync<MemoryItemRow>(
    `SELECT * FROM memory_items ${whereClause} 
     ORDER BY confidence DESC, created_at DESC 
     LIMIT ?`,
    [...params, args.limit]
  );
  
  return rows;
};

export const searchAttachments = async (args: {
  entities: string[];
  types?: AttachmentType[] | null;
  recent_days?: number | null;
  limit: number;
}): Promise<AttachmentRow[]> => {
  const db = getDatabase();
  
  if (args.entities.length === 0) return [];
  
  const entityPlaceholders = args.entities.map(() => '?').join(', ');
  const params: (string | number)[] = [...args.entities];
  
  let typeFilter = '';
  if (args.types && args.types.length > 0) {
    const typePlaceholders = args.types.map(() => '?').join(', ');
    typeFilter = `AND a.type IN (${typePlaceholders})`;
    params.push(...args.types);
  }
  
  let timeFilter = '';
  if (args.recent_days) {
    timeFilter = 'AND a.created_at >= ?';
    params.push(nowMs() - args.recent_days * 86400000);
  }
  
  params.push(args.limit);
  
  const rows = await db.getAllAsync<AttachmentRow>(
    `SELECT DISTINCT a.* FROM attachments a
     INNER JOIN entity_index ei ON ei.source_id = a.id AND ei.source_type = 'attachment'
     WHERE ei.entity IN (${entityPlaceholders})
     ${typeFilter}
     ${timeFilter}
     ORDER BY ei.weight DESC, a.created_at DESC
     LIMIT ?`,
    params
  );
  
  return rows;
};

export const getAttachmentBundle = async (args: {
  attachment_id: string;
}): Promise<AttachmentBundle | null> => {
  const db = getDatabase();
  
  const attachment = await db.getFirstAsync<AttachmentRow>(
    `SELECT * FROM attachments WHERE id = ?`,
    [args.attachment_id]
  );
  
  if (!attachment) return null;
  
  const metadataRows = await db.getAllAsync<{
    kind: MetadataKind;
    model: string;
    created_at: number;
    payload_json: string;
  }>(
    `SELECT kind, model, created_at, payload_json FROM attachment_metadata 
     WHERE attachment_id = ? ORDER BY created_at ASC`,
    [args.attachment_id]
  );
  
  return {
    attachment,
    metadata: metadataRows.map(row => ({
      kind: row.kind,
      model: row.model,
      created_at: row.created_at,
      payload: JSON.parse(row.payload_json),
    })),
  };
};

export const getMessageWithAttachments = async (args: {
  message_id: string;
}): Promise<{ message: MessageRow; attachments: AttachmentRow[] } | null> => {
  const db = getDatabase();
  
  const message = await db.getFirstAsync<MessageRow>(
    `SELECT * FROM messages WHERE id = ?`,
    [args.message_id]
  );
  
  if (!message) return null;
  
  const attachments = await db.getAllAsync<AttachmentRow>(
    `SELECT a.* FROM attachments a
     INNER JOIN message_attachments ma ON ma.attachment_id = a.id
     WHERE ma.message_id = ?
     ORDER BY ma.position ASC`,
    [args.message_id]
  );
  
  return { message, attachments };
};

export const getRecentMessages = async (args: {
  limit: number;
}): Promise<Array<{ id: string; role: string; text: string | null; created_at: number }>> => {
  const db = getDatabase();
  
  return await db.getAllAsync(
    `SELECT id, role, text, created_at FROM messages 
     ORDER BY created_at DESC LIMIT ?`,
    [args.limit]
  );
};
```

---

## Query Semantics (Deterministic)

| Query | Ordering | Notes |
|-------|----------|-------|
| `searchMemory` | confidence DESC, created_at DESC | Higher confidence first |
| `searchAttachments` | weight DESC, created_at DESC | Uses entity_index join |
| `getRecentMessages` | created_at DESC | Most recent first |

---

## Test Specifications

**File: `src/api/__tests__/deviceWriteApi.test.ts`**

```typescript
import { insertMessage, insertAttachment, insertMemoryItem, insertEntityIndex, linkMessageAttachment, insertAttachmentMetadata } from '../deviceWriteApi';
import { getMockDatabase, resetMockDatabase } from '../../__mocks__/expo-sqlite';
import { setDatabaseInstance } from '../../db/connection';

jest.mock('expo-sqlite');

describe('DeviceWriteAPI', () => {
  beforeEach(() => {
    resetMockDatabase();
    setDatabaseInstance(null);
  });

  describe('insertMessage', () => {
    it('inserts message with UPSERT', async () => {
      await insertMessage({
        id: 'msg-1',
        role: 'user',
        text: 'Hello',
        created_at: 1700000000000,
      });
      
      const mockDb = getMockDatabase();
      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO messages'),
        ['msg-1', 'user', 'Hello', 1700000000000]
      );
    });
  });

  describe('insertAttachment', () => {
    it('inserts attachment with all fields', async () => {
      await insertAttachment({
        id: 'att-1',
        type: 'image',
        mime: 'image/jpeg',
        local_path: 'file:///path/to/image.jpg',
        size_bytes: 12345,
        duration_ms: null,
        width: 1024,
        height: 768,
        created_at: 1700000000000,
      });
      
      const mockDb = getMockDatabase();
      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO attachments'),
        expect.arrayContaining(['att-1', 'image', 'image/jpeg'])
      );
    });
  });

  describe('insertMemoryItem', () => {
    it('inserts memory with SPO triple', async () => {
      await insertMemoryItem({
        id: 'mem-1',
        type: 'object_location',
        subject: 'keys',
        predicate: 'last_seen',
        object: 'kitchen counter',
        time_anchor: 1700000000000,
        confidence: 0.85,
        source_attachment_id: 'att-1',
        source_message_id: null,
        created_at: 1700000000000,
      });
      
      const mockDb = getMockDatabase();
      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO memory_items'),
        expect.arrayContaining(['mem-1', 'object_location', 'keys'])
      );
    });
  });
});
```

**File: `src/api/__tests__/deviceReadApi.test.ts`**

```typescript
import { searchMemory, searchAttachments, getAttachmentBundle, getRecentMessages } from '../deviceReadApi';
import { getMockDatabase, resetMockDatabase } from '../../__mocks__/expo-sqlite';
import { setDatabaseInstance } from '../../db/connection';

jest.mock('expo-sqlite');

describe('DeviceReadAPI', () => {
  beforeEach(() => {
    resetMockDatabase();
    setDatabaseInstance(null);
  });

  describe('searchMemory', () => {
    it('builds query with subject filter', async () => {
      await searchMemory({ subject: 'keys', limit: 10 });
      
      const mockDb = getMockDatabase();
      expect(mockDb?.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('subject = ?'),
        expect.arrayContaining(['keys', 10])
      );
    });

    it('orders by confidence DESC', async () => {
      await searchMemory({ limit: 5 });
      
      const mockDb = getMockDatabase();
      expect(mockDb?.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY confidence DESC'),
        expect.any(Array)
      );
    });
  });

  describe('searchAttachments', () => {
    it('joins entity_index table', async () => {
      await searchAttachments({ entities: ['keys', 'kitchen'], limit: 10 });
      
      const mockDb = getMockDatabase();
      expect(mockDb?.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('INNER JOIN entity_index'),
        expect.arrayContaining(['keys', 'kitchen', 10])
      );
    });

    it('returns empty for no entities', async () => {
      const result = await searchAttachments({ entities: [], limit: 10 });
      expect(result).toEqual([]);
    });
  });

  describe('getAttachmentBundle', () => {
    it('returns null for non-existent attachment', async () => {
      const mockDb = getMockDatabase();
      mockDb?.getFirstAsync.mockResolvedValueOnce(null);
      
      const result = await getAttachmentBundle({ attachment_id: 'not-found' });
      expect(result).toBeNull();
    });
  });
});
```

---

## Acceptance Criteria

- [ ] All 6 write operations implemented with UPSERT
- [ ] All 5 read operations implemented with correct ordering
- [ ] searchAttachments uses entity_index join correctly
- [ ] getAttachmentBundle parses payload_json to object
- [ ] All operations are idempotent (re-run produces same result)
- [ ] All tests pass without device/emulator

---

## Report Template

Create `reports/epic_1_4_report.md`:

```markdown
# Epic 1.4 Completion Report

## Summary
[Description of Device APIs implementation]

## APIs Implemented
| API | Operations | Status |
|-----|------------|--------|
| DeviceWriteAPI | 6 | ✓ |
| DeviceReadAPI | 5 | ✓ |

## Test Results
[Jest output]

## Idempotency Verified
- [ ] insertMessage re-run succeeds
- [ ] insertMemoryItem re-run succeeds

## Next Steps
Epic 1 complete. Proceed to Epic 2: Media Capture & UI Foundation
```
