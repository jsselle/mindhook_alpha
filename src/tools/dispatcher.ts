import {
    getAttachmentBundle,
    getMessageWithAttachments,
    getRecentMessages,
    searchAttachments,
    searchMemory,
} from '../api/deviceReadApi';
import {
    insertAttachmentMetadata,
    insertEntityIndex,
    insertMemoryItem,
} from '../api/deviceWriteApi';
import { AttachmentType, EntityIndexRow, MemoryItemRow, MemoryType, MetadataKind } from '../types/domain';

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
