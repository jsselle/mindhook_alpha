// Activity strip label mappings for backend stages and tools
// Maps internal identifiers to user-friendly display text

export const ACTIVITY_LABELS: Record<string, string> = {
    connecting: 'Preparing...',
    preparing_model: 'Preparing...',
    generating: 'Thinking...',
    transcribing_audio: 'Transcribing audio...',
    analyzing_image: 'Analyzing image...',
    searching_memory: 'Searching memory...',
    storing_metadata: 'Storing information...',
    indexing_entities: 'Indexing...',
    finalizing: 'Finalizing response...',
};

/**
 * Get user-friendly label for a backend activity stage
 * @param stage - The internal stage identifier from backend
 * @returns User-friendly display text, or the stage name if unknown
 */
export const getActivityLabel = (stage: string): string => {
    return ACTIVITY_LABELS[stage] || stage;
};

// Map tool names to activity messages
export const TOOL_LABELS: Record<string, string> = {
    store_attachment_metadata: 'Storing metadata...',
    store_memory_item: 'Saving to memory...',
    index_entity: 'Indexing entities...',
    search_memory: 'Searching memory...',
    search_attachments: 'Searching attachments...',
    get_attachment_bundle: 'Loading attachment...',
    get_message_with_attachments: 'Loading message...',
    recent_messages: 'Loading context...',
};

/**
 * Get user-friendly label for a tool execution
 * @param toolName - The tool name from backend
 * @returns User-friendly display text, or the tool name if unknown
 */
export const getToolLabel = (toolName: string): string => {
    return TOOL_LABELS[toolName] || toolName;
};
