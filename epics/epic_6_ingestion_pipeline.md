# Epic 6: Ingestion Pipeline

| Field | Value |
|-------|-------|
| **Epic** | 6 |
| **Name** | Ingestion Pipeline |
| **Effort** | 0.5 days |
| **Dependencies** | Epic 5 |
| **Predecessors** | Tool bridge system |

---

## Overview

Define the ingestion flow where Gemini processes attachments (audio transcription, image analysis) and stores metadata, entities, and memory items on device via tools.

---

## Ingestion Flow Algorithm

```
FOR EACH attachment in run_start.attachments:
  1. Generate metadata based on type:
     - audio: transcript (kind='transcript')
     - image: scene description (kind='scene')
     - all types: entities (kind='entities')
     
  2. Call store_attachment_metadata for each metadata kind
  
  3. Extract entities from metadata
  
  4. FOR EACH entity:
     Call index_entity to create lookup entry
     
  5. IF extractable facts with confidence >= 0.7:
     Call store_memory_item for durable facts
```

---

## Metadata Payload Schemas

### Transcript Payload (audio)

```typescript
interface TranscriptPayload {
  text: string;           // Full transcription
  language?: string;      // Detected language code
  confidence?: number;    // 0-1 transcription confidence
  segments?: Array<{
    start_ms: number;
    end_ms: number;
    text: string;
  }>;
}
```

### Scene Payload (image)

```typescript
interface ScenePayload {
  description: string;    // Natural language description
  objects: string[];      // Detected objects
  actions?: string[];     // Detected activities
  text_content?: string;  // OCR text if present
  location_hint?: string; // Inferred location
}
```

### Entities Payload (all types)

```typescript
interface EntitiesPayload {
  entities: Array<{
    name: string;         // Normalized entity name
    type: 'person' | 'object' | 'location' | 'organization' | 'concept';
    confidence: number;   // 0-1
    mentions: number;     // Count of mentions
  }>;
}
```

---

## Backend Prompt Enhancement

Add to `backend_server/src/gemini/systemPrompt.ts`:

```typescript
export const INGESTION_PROMPT_SECTION = `
## Ingestion Rules

When processing user-provided media:

### Audio Processing
1. Generate a complete transcript
2. Call store_attachment_metadata with:
   - kind: 'transcript'
   - payload: { text: "transcript content", confidence: 0.95 }
3. Extract entities mentioned (people, objects, locations)
4. Call index_entity for each entity with source_type='attachment'

### Image Processing  
1. Analyze the scene and objects visible
2. Call store_attachment_metadata with:
   - kind: 'scene'
   - payload: { description: "...", objects: [...] }
3. Extract entities from objects and scene
4. Call index_entity for each entity

### Memory Extraction
For factual statements with confidence >= 0.7:
- Object locations → type='object_location'
  Example: "keys are on the kitchen counter"
- Repeated behaviors → type='habit'
  Example: "user walks the dog every morning"
- Time-anchored events → type='event'
  Example: "meeting with John on Tuesday"
- General facts → type='fact'
  Example: "user's car is a blue Honda"

Always include source_attachment_id when creating memory items from media.
`;
```

---

## Example Tool Call Sequence (Audio)

User sends audio voice note: "I left my keys on the kitchen counter near the coffee maker"

Gemini generates:

```json
// 1. Store transcript
{
  "name": "store_attachment_metadata",
  "args": {
    "metadata_id": "meta-uuid-1",
    "attachment_id": "att-uuid-1",
    "model": "gemini-3",
    "kind": "transcript",
    "payload": {
      "text": "I left my keys on the kitchen counter near the coffee maker",
      "confidence": 0.95
    },
    "created_at": 1700000000000,
    "schema_version": "1"
  }
}

// 2. Store entities
{
  "name": "store_attachment_metadata",
  "args": {
    "metadata_id": "meta-uuid-2",
    "attachment_id": "att-uuid-1",
    "model": "gemini-3",
    "kind": "entities",
    "payload": {
      "entities": [
        { "name": "keys", "type": "object", "confidence": 0.95, "mentions": 1 },
        { "name": "kitchen counter", "type": "location", "confidence": 0.9, "mentions": 1 },
        { "name": "coffee maker", "type": "object", "confidence": 0.85, "mentions": 1 }
      ]
    },
    "created_at": 1700000000001,
    "schema_version": "1"
  }
}

// 3. Index entities
{
  "name": "index_entity",
  "args": {
    "entity_index_id": "idx-uuid-1",
    "entity": "keys",
    "source_type": "attachment",
    "source_id": "att-uuid-1",
    "weight": 0.95,
    "created_at": 1700000000002,
    "schema_version": "1"
  }
}

// 4. Store memory item
{
  "name": "store_memory_item",
  "args": {
    "memory_item_id": "mem-uuid-1",
    "type": "object_location",
    "subject": "keys",
    "predicate": "last_seen",
    "object": "kitchen counter near coffee maker",
    "time_anchor": 1700000000000,
    "confidence": 0.9,
    "source_attachment_id": "att-uuid-1",
    "source_message_id": null,
    "created_at": 1700000000003,
    "schema_version": "1"
  }
}
```

---

## Test Specifications

**File: `backend_server/__tests__/ingestion.test.ts`**

```typescript
import { INGESTION_PROMPT_SECTION } from '../src/gemini/systemPrompt';

describe('Ingestion Prompt', () => {
  it('includes audio processing instructions', () => {
    expect(INGESTION_PROMPT_SECTION).toContain('Audio Processing');
    expect(INGESTION_PROMPT_SECTION).toContain('transcript');
  });

  it('includes image processing instructions', () => {
    expect(INGESTION_PROMPT_SECTION).toContain('Image Processing');
    expect(INGESTION_PROMPT_SECTION).toContain('scene');
  });

  it('specifies confidence threshold', () => {
    expect(INGESTION_PROMPT_SECTION).toContain('0.7');
  });

  it('lists memory types', () => {
    expect(INGESTION_PROMPT_SECTION).toContain('object_location');
    expect(INGESTION_PROMPT_SECTION).toContain('habit');
    expect(INGESTION_PROMPT_SECTION).toContain('event');
  });
});
```

**Integration Test (Manual)**

1. Send audio message: "I put my wallet in the drawer"
2. Verify tool calls made:
   - store_attachment_metadata (transcript)
   - store_attachment_metadata (entities)
   - index_entity (wallet, drawer)
   - store_memory_item (wallet location)
3. Query: "Where is my wallet?"
4. Verify search_memory returns the stored item

---

## Acceptance Criteria

- [ ] System prompt includes ingestion instructions
- [ ] Audio attachments generate transcript metadata
- [ ] Image attachments generate scene metadata
- [ ] Entities extracted and indexed
- [ ] Memory items created for high-confidence facts
- [ ] source_attachment_id linked correctly
- [ ] All tests pass

---

## Report Template

Create `reports/epic_6_report.md` after completion.
