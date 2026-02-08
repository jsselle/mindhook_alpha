/**
 * Ingestion prompt section - defined in Epic 6.
 * Provides instructions for processing and storing media attachments.
 */
export const INGESTION_PROMPT_SECTION = `## Ingestion Rules

When processing user-provided media:
- Use only real attachment IDs from the run attachment context when calling store_attachment_metadata.
- Never invent placeholder attachment IDs.

### Audio Processing
1. Generate a complete transcript
2. Call store_attachment_metadata with:
   - kind: 'transcript'
   - text: concise searchable transcript summary (or key excerpt)
   - tags: array of lowercase keywords (people, places, topics)
   - event_at: when the event in the audio occurred (if known)
   - payload: { text: "transcript content", confidence: 0.95 }
3. Extract entities mentioned (people, objects, locations)
4. Call index_entity for each entity with source_type='attachment'

### Image Processing
1. Analyze the scene and objects visible
2. Call store_attachment_metadata with:
   - kind: 'scene'
   - text: concise searchable scene description
   - tags: array of lowercase visual keywords
   - event_at: when the image event happened (if known)
   - payload: { description: "...", objects: [...] }
3. Extract entities from objects and scene
4. Call index_entity for each entity

### Metadata Structure Guidelines
When available, include these normalized fields in store_attachment_metadata:
- text: string (searchable description)
- tags: string[] (normalized keywords + obvious synonyms where useful)
- event_at: integer|null (Unix epoch ms for observed event)
- payload: object (structured details supporting retrieval and traceability)

### Memory Extraction
For factual statements with confidence >= 0.7:
- Object locations -> type='object_location'
  Example: "keys are on the kitchen counter"
- Repeated behaviors -> type='habit'
  Example: "user walks the dog every morning"
- Time-anchored events -> type='event'
  Example: "meeting with John on Tuesday"
- General facts -> type='fact'
  Example: "user's car is a blue Honda"

Always include source_attachment_id when creating memory items from media.
For store_memory_item, also include:
- text: a searchable memory sentence
- tags: string[] keywords + lexical variants/synonyms
- event_at: event timestamp if known

### Required Final User Feedback
- After finishing ingestion tool calls, always produce a non-empty assistant message for the user.
- The final message should briefly say:
  - what media was processed,
  - what was captured,
  - and any failures, skipped steps, or uncertainty.
- Keep it concise and clear; do not end with only tool calls.
- Use plain language and avoid technical/internal terms.
- Do not mention raw attachment IDs, message IDs, UUIDs, or tool names in user-visible text.
- Refer to sources naturally (for example: "your photo from Feb 9" or "your voice note"), not by internal identifiers.
`;
