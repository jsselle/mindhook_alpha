# Epic 1.2: SQLite Schema & Database Layer

| Field | Value |
|-------|-------|
| **Epic** | 1.2 |
| **Name** | SQLite Schema & Database Layer |
| **Effort** | 0.5 days |
| **Dependencies** | Epic 1.1 |
| **Predecessors** | Project setup, testing framework, type definitions |

---

## Overview

Implement the complete SQLite database schema and connection management layer. This epic creates all 6 tables with proper foreign keys, indexes, and a migration strategy.

---

## Prerequisites

- Epic 1.1 completed (types defined in `src/types/domain.ts`)
- Jest mocks for expo-sqlite in place

---

## Complete SQLite Schema (DDL)

**File: `src/db/schema.ts`**

```typescript
export const SCHEMA_VERSION = 1;

export const DDL_STATEMENTS = `
PRAGMA foreign_keys = ON;

-- Messages table (user, assistant, system messages)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  text TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Attachments table (media files metadata)
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('image', 'audio', 'video', 'file')),
  mime TEXT NOT NULL,
  local_path TEXT NOT NULL,
  size_bytes INTEGER,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  created_at INTEGER NOT NULL
);

-- Junction table for message-attachment relationship
CREATE TABLE IF NOT EXISTS message_attachments (
  message_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  position INTEGER,
  PRIMARY KEY (message_id, attachment_id),
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY(attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_msg_attach_msg ON message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_msg_attach_attach ON message_attachments(attachment_id);

-- AI-generated metadata for attachments
CREATE TABLE IF NOT EXISTS attachment_metadata (
  id TEXT PRIMARY KEY,
  attachment_id TEXT NOT NULL,
  model TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('transcript', 'scene', 'entities', 'summary', 'claims')),
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_metadata_attachment ON attachment_metadata(attachment_id);
CREATE INDEX IF NOT EXISTS idx_metadata_kind ON attachment_metadata(kind);

-- Durable memory facts (SPO triples)
CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('object_location', 'habit', 'event', 'fact')),
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  time_anchor INTEGER,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  source_attachment_id TEXT,
  source_message_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_subject ON memory_items(subject);
CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_items(type);
CREATE INDEX IF NOT EXISTS idx_memory_time ON memory_items(time_anchor);

-- Entity index for fast lookups
CREATE TABLE IF NOT EXISTS entity_index (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('attachment', 'memory', 'message')),
  source_id TEXT NOT NULL,
  weight REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entity_term ON entity_index(entity);
`;
```

---

## Database Connection Manager

**File: `src/db/connection.ts`**

```typescript
import * as SQLite from 'expo-sqlite';
import { DDL_STATEMENTS, SCHEMA_VERSION } from './schema';

const DB_NAME = 'brain_app.db';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export const getDatabase = (): SQLite.SQLiteDatabase => {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync(DB_NAME);
  }
  return dbInstance;
};

export const initializeDatabase = async (): Promise<void> => {
  const db = getDatabase();
  
  // Execute all DDL statements
  await db.execAsync(DDL_STATEMENTS);
  
  // Store schema version for future migrations
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);
    INSERT OR REPLACE INTO schema_version (version) VALUES (${SCHEMA_VERSION});
  `);
};

export const resetDatabase = async (): Promise<void> => {
  const db = getDatabase();
  
  // Drop all tables in reverse dependency order
  await db.execAsync(`
    DROP TABLE IF EXISTS entity_index;
    DROP TABLE IF EXISTS memory_items;
    DROP TABLE IF EXISTS attachment_metadata;
    DROP TABLE IF EXISTS message_attachments;
    DROP TABLE IF EXISTS attachments;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS schema_version;
  `);
  
  // Reinitialize
  await initializeDatabase();
};

export const closeDatabase = (): void => {
  if (dbInstance) {
    // Note: expo-sqlite sync API doesn't have explicit close
    dbInstance = null;
  }
};

// For testing: inject mock database
export const setDatabaseInstance = (db: SQLite.SQLiteDatabase | null): void => {
  dbInstance = db;
};
```

---

## Implementation Checklist

1. [ ] Create `src/db/schema.ts` with DDL_STATEMENTS
2. [ ] Create `src/db/connection.ts` with connection manager
3. [ ] Create `src/db/index.ts` exporting public API
4. [ ] Write unit tests using mocked expo-sqlite
5. [ ] Write integration test (optional, requires device)

---

## Test Specifications

**File: `src/db/__tests__/connection.test.ts`**

```typescript
import { getDatabase, initializeDatabase, resetDatabase, setDatabaseInstance } from '../connection';
import { getMockDatabase, resetMockDatabase } from '../../__mocks__/expo-sqlite';

// Use mock
jest.mock('expo-sqlite');

describe('Database Connection', () => {
  beforeEach(() => {
    resetMockDatabase();
    setDatabaseInstance(null);
  });

  describe('getDatabase', () => {
    it('returns same instance on multiple calls', () => {
      const db1 = getDatabase();
      const db2 = getDatabase();
      expect(db1).toBe(db2);
    });
  });

  describe('initializeDatabase', () => {
    it('executes DDL statements', async () => {
      await initializeDatabase();
      const mockDb = getMockDatabase();
      expect(mockDb?.execAsync).toHaveBeenCalled();
      
      // Verify DDL contains expected table creations
      const calls = mockDb?.execAsync.mock.calls;
      const ddlCall = calls?.[0]?.[0] as string;
      expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS messages');
      expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS attachments');
      expect(ddlCall).toContain('CREATE TABLE IF NOT EXISTS memory_items');
    });
  });

  describe('resetDatabase', () => {
    it('drops and recreates all tables', async () => {
      await resetDatabase();
      const mockDb = getMockDatabase();
      
      // Should have DROP statements
      const calls = mockDb?.execAsync.mock.calls.flat().join(' ');
      expect(calls).toContain('DROP TABLE IF EXISTS');
    });
  });
});
```

**File: `src/db/__tests__/schema.test.ts`**

```typescript
import { DDL_STATEMENTS, SCHEMA_VERSION } from '../schema';

describe('Database Schema', () => {
  it('has valid schema version', () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('enables foreign keys', () => {
    expect(DDL_STATEMENTS).toContain('PRAGMA foreign_keys = ON');
  });

  it('creates all required tables', () => {
    const requiredTables = [
      'messages',
      'attachments',
      'message_attachments',
      'attachment_metadata',
      'memory_items',
      'entity_index'
    ];
    
    requiredTables.forEach(table => {
      expect(DDL_STATEMENTS).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    });
  });

  it('creates required indexes', () => {
    const requiredIndexes = [
      'idx_messages_created_at',
      'idx_metadata_attachment',
      'idx_metadata_kind',
      'idx_memory_subject',
      'idx_memory_type',
      'idx_entity_term'
    ];
    
    requiredIndexes.forEach(idx => {
      expect(DDL_STATEMENTS).toContain(`CREATE INDEX IF NOT EXISTS ${idx}`);
    });
  });

  it('has CHECK constraints for enums', () => {
    expect(DDL_STATEMENTS).toContain("role IN ('user', 'assistant', 'system')");
    expect(DDL_STATEMENTS).toContain("type IN ('image', 'audio', 'video', 'file')");
    expect(DDL_STATEMENTS).toContain("kind IN ('transcript', 'scene', 'entities', 'summary', 'claims')");
  });
});
```

---

## Acceptance Criteria

- [ ] All 6 tables created with correct columns
- [ ] Foreign key constraints enforced (PRAGMA foreign_keys = ON)
- [ ] All CHECK constraints for enum fields present
- [ ] All indexes created per specification
- [ ] initializeDatabase() is idempotent
- [ ] resetDatabase() cleanly drops and recreates
- [ ] All tests pass without device/emulator

---

## Report Template

Create `reports/epic_1_2_report.md`:

```markdown
# Epic 1.2 Completion Report

## Summary
[Description of schema implementation]

## Tables Created
| Table | Columns | Indexes |
|-------|---------|---------|
| messages | id, role, text, created_at | idx_messages_created_at |
| ... | ... | ... |

## Test Results
[Jest output]

## Schema Validation
[Confirm CHECK constraints, foreign keys]

## Next Steps
Proceed to Epic 1.3: File Storage System
```
