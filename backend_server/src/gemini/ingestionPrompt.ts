/**
 * Ingestion prompt section - defined in Epic 6.
 * Provides instructions for processing and storing media attachments.
 */
export const INGESTION_PROMPT_SECTION = `## Ingestion Rules

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
