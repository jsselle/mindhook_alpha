/**
 * Retrieval prompt section - defined in Epic 7.
 * Provides instructions for searching and retrieving stored information.
 */
export const RETRIEVAL_PROMPT_SECTION = `## Retrieval Rules

When user asks about stored information (locations, history, prior notes):

1. ALWAYS call search_memory first with relevant subject
   - For "where is X?" → subject="X", type="object_location"
   - For "when did I..." → type="event", recent_days=30
   - For habits → type="habit"

2. If search_memory returns no results or low confidence:
   Call search_attachments with related entities
   - For "keys" → entities=["keys", "wallet"] (related items)
   
3. For top attachment results, call get_attachment_bundle
   to retrieve transcript/scene for full context

4. Formulate answer citing evidence:
   - "Based on your voice note from [date], your keys are..."
   - "I found a photo showing..."
   
5. Always include citations in your response for traceability
`;
