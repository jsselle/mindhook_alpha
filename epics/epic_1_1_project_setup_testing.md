# Epic 1.1: Project Setup & Testing Framework

| Field | Value |
|-------|-------|
| **Epic** | 1.1 |
| **Name** | Project Setup & Testing Framework |
| **Effort** | 0.5 days |
| **Dependencies** | None |
| **Predecessors** | None |

---

## Overview

Establish the foundational project structure, install all required dependencies, and configure a **portable testing framework** that runs without emulators, backend servers, or physical devices.

---

## Prerequisites

- Node.js 18+ installed
- npm or yarn available
- Fresh Expo project (already initialized)

---

## Implementation Tasks

### 1. Install Core Dependencies

```bash
# Already installed (verify in package.json):
# expo-sqlite, expo-file-system, expo-image-picker, expo-av, expo-crypto

# Add testing dependencies:
npm install --save-dev jest @types/jest ts-jest @testing-library/react-native @testing-library/jest-native jest-expo

# Add UUID generation:
npm install react-native-uuid
```

### 2. Configure Jest for Portable Testing

Create `jest.config.js` in project root:

```javascript
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)'
  ],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
```

### 3. Create Source Directory Structure

```
src/
├── db/
│   ├── __tests__/
│   ├── schema.ts
│   ├── connection.ts
│   └── index.ts
├── storage/
│   ├── __tests__/
│   ├── fileManager.ts
│   └── index.ts
├── api/
│   ├── __tests__/
│   ├── deviceWriteApi.ts
│   ├── deviceReadApi.ts
│   └── index.ts
├── types/
│   ├── domain.ts
│   ├── api.ts
│   └── index.ts
├── utils/
│   ├── __tests__/
│   ├── uuid.ts
│   └── time.ts
└── __mocks__/
    ├── expo-sqlite.ts
    ├── expo-file-system.ts
    └── expo-crypto.ts
```

### 4. Create Expo Module Mocks

**File: `src/__mocks__/expo-sqlite.ts`**

```typescript
// Mock SQLite for portable testing without native modules
export interface MockDatabase {
  execAsync: jest.Mock;
  runAsync: jest.Mock;
  getFirstAsync: jest.Mock;
  getAllAsync: jest.Mock;
}

const createMockDatabase = (): MockDatabase => ({
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 1 }),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  getAllAsync: jest.fn().mockResolvedValue([]),
});

let mockDb: MockDatabase | null = null;

export const openDatabaseSync = jest.fn(() => {
  if (!mockDb) mockDb = createMockDatabase();
  return mockDb;
});

export const getMockDatabase = (): MockDatabase | null => mockDb;
export const resetMockDatabase = (): void => { mockDb = null; };
```

**File: `src/__mocks__/expo-file-system.ts`**

```typescript
export const documentDirectory = 'file:///mock/documents/';

export const makeDirectoryAsync = jest.fn().mockResolvedValue(undefined);
export const writeAsStringAsync = jest.fn().mockResolvedValue(undefined);
export const readAsStringAsync = jest.fn().mockResolvedValue('');
export const deleteAsync = jest.fn().mockResolvedValue(undefined);
export const getInfoAsync = jest.fn().mockResolvedValue({ exists: true, size: 1024 });
export const copyAsync = jest.fn().mockResolvedValue(undefined);

export const EncodingType = {
  UTF8: 'utf8',
  Base64: 'base64',
};
```

### 5. Create Base Types

**File: `src/types/domain.ts`**

```typescript
// ===== ENUMS (string enums, strict parsing) =====

export type Role = 'user' | 'assistant' | 'system';
export type AttachmentType = 'image' | 'audio' | 'video' | 'file';
export type MetadataKind = 'transcript' | 'scene' | 'entities' | 'summary' | 'claims';
export type MemoryType = 'object_location' | 'habit' | 'event' | 'fact';
export type EntitySourceType = 'attachment' | 'memory' | 'message';

// ===== ROW TYPES (match SQLite schema) =====

export interface MessageRow {
  id: string;           // UUID v4
  role: Role;
  text: string | null;
  created_at: number;   // Unix epoch ms
}

export interface AttachmentRow {
  id: string;           // UUID v4
  type: AttachmentType;
  mime: string;
  local_path: string;   // file:// URI
  size_bytes: number | null;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  created_at: number;   // Unix epoch ms
}

export interface MessageAttachmentLink {
  message_id: string;
  attachment_id: string;
  position: number | null;
}

export interface AttachmentMetadataRow {
  id: string;           // UUID v4
  attachment_id: string;
  model: string;
  kind: MetadataKind;
  payload_json: string; // JSON.stringify(payload)
  created_at: number;   // Unix epoch ms
}

export interface MemoryItemRow {
  id: string;           // UUID v4
  type: MemoryType;
  subject: string;
  predicate: string;
  object: string;
  time_anchor: number | null;
  confidence: number;   // 0..1
  source_attachment_id: string | null;
  source_message_id: string | null;
  created_at: number;   // Unix epoch ms
}

export interface EntityIndexRow {
  id: string;           // UUID v4
  entity: string;
  source_type: EntitySourceType;
  source_id: string;
  weight: number;       // 0..1 or ranking
  created_at: number;   // Unix epoch ms
}
```

### 6. Create Utility Functions

**File: `src/utils/uuid.ts`**

```typescript
import uuid from 'react-native-uuid';

export const generateUUID = (): string => {
  return uuid.v4() as string;
};
```

**File: `src/utils/time.ts`**

```typescript
export const nowMs = (): number => Date.now();

export const daysAgoMs = (days: number): number => {
  return nowMs() - days * 86400000;
};
```

### 7. Add npm Scripts

Update `package.json` scripts:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --reporters=default"
  }
}
```

---

## Acceptance Criteria

- [ ] All dependencies installed without errors
- [ ] `npm test` runs without requiring emulator/device
- [ ] Directory structure created per specification
- [ ] Mock files work (tests don't fail on import)
- [ ] Type definitions compile without errors
- [ ] UUID generation produces valid v4 UUIDs

---

## Test Specifications

### Unit Tests

**File: `src/utils/__tests__/uuid.test.ts`**

```typescript
import { generateUUID } from '../uuid';

describe('UUID Generation', () => {
  it('generates valid UUID v4 format', () => {
    const id = generateUUID();
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidV4Regex);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateUUID()));
    expect(ids.size).toBe(100);
  });
});
```

**File: `src/utils/__tests__/time.test.ts`**

```typescript
import { nowMs, daysAgoMs } from '../time';

describe('Time Utilities', () => {
  it('nowMs returns current timestamp', () => {
    const before = Date.now();
    const result = nowMs();
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });

  it('daysAgoMs calculates correctly', () => {
    const now = nowMs();
    const sevenDaysAgo = daysAgoMs(7);
    expect(now - sevenDaysAgo).toBe(7 * 86400000);
  });
});
```

---

## Report Template

After completing this epic, create `reports/epic_1_1_report.md`:

```markdown
# Epic 1.1 Completion Report

## Summary
[Brief description of what was accomplished]

## Changes Made
- [ ] Dependencies added to package.json
- [ ] Jest configuration created
- [ ] Directory structure established
- [ ] Mock files created
- [ ] Type definitions created
- [ ] Utility functions implemented

## Test Results
[Paste npm test output]

## Issues Encountered
[Any blockers or deviations from plan]

## Next Steps
Proceed to Epic 1.2: SQLite Schema & Database Layer
```
