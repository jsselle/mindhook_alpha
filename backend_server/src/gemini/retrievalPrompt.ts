/**
 * Retrieval prompt section - defined in Epic 7.
 * Provides instructions for searching and retrieving stored information.
 */
export const RETRIEVAL_PROMPT_SECTION = `## Retrieval Rules

When user asks about stored information (locations, history, prior notes):

1. ALWAYS call search_memory first
   - Map user intent into:
     - text: query phrase ("where are my keys", "green cartoon")
     - tags: focused keywords + synonyms ["keys","keychain","wallet"]
     - tag_mode: "or" for broad recall, "and" for precise filtering
     - date_from/date_to when user gives timeframe
   - Interpret search_memory as unified retrieval across memory items, attachment metadata, and reminders
   - Use per-hit type fields (for example \`record_type\`) to reason correctly about reminder vs attachment vs memory results

2. Formulate answer citing evidence:
   - "Based on your voice note from [date], your keys are..."
   - "I found a photo showing..."
   - Answer the user's question first.
   - Add a brief summary of what you checked only when helpful.
   - Do not include raw attachment IDs, message IDs, UUIDs, tool names, or internal field names in message text.

3. search_memory results may include hydrated attachment context for attachment-based hits.
   - Use that context directly instead of making follow-up retrieval calls unless absolutely necessary.

4. Always include citations in your response for traceability

## Reminder Retrieval Rules

1. If the query is reminder list/status oriented, call \`list_reminders\` first.
2. If the query is memory/history oriented, keep \`search_memory\` as the first retrieval step.
3. Never expose internal IDs, tool names, or internal field names in user-facing text.
`;
