import {
    attachmentExists,
    getAttachmentBundle,
    getMessageWithAttachments,
    getRecentMessages,
    searchMemory,
} from '../api/deviceReadApi';
import {
    insertAttachmentMetadata,
    insertEntityIndex,
    insertMemoryItem,
} from '../api/deviceWriteApi';
import { EntityIndexRow, MemoryItemRow, MemoryType, MetadataKind } from '../types/domain';
import { generateUUID } from '../utils/uuid';

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
    const attachmentId = args.attachment_id as string;
    const metadataId = (args.metadata_id as string) || generateUUID();
    const exists = await attachmentExists({ attachment_id: attachmentId });
    if (!exists) {
        throw new ToolError(
            TOOL_ERROR_CODES.INVALID_ARGS,
            `attachment_id not found: ${attachmentId}. Use an existing attachment_id from this run context.`,
            false
        );
    }

    await insertAttachmentMetadata({
        id: metadataId,
        attachment_id: attachmentId,
        model: args.model as string,
        kind: args.kind as MetadataKind,
        text: (args.text as string) ?? null,
        tags: (args.tags as string[]) ?? null,
        event_at: (args.event_at as number) ?? null,
        payload: args.payload,
        created_at: args.created_at as number,
    });
    return { metadata_id: metadataId };
}

async function handleStoreMemoryItem(args: Record<string, unknown>) {
    const memoryItemId = (args.memory_item_id as string) || generateUUID();
    const row: MemoryItemRow = {
        id: memoryItemId,
        type: args.type as MemoryType,
        subject: args.subject as string,
        predicate: args.predicate as string,
        object: args.object as string,
        text: (args.text as string) ?? null,
        tags_json: Array.isArray(args.tags) ? JSON.stringify(args.tags) : null,
        event_at: (args.event_at as number) ?? null,
        time_anchor: (args.time_anchor as number) ?? null,
        confidence: args.confidence as number,
        source_attachment_id: (args.source_attachment_id as string) ?? null,
        source_message_id: (args.source_message_id as string) ?? null,
        created_at: args.created_at as number,
    };
    await insertMemoryItem(row);
    return { memory_item_id: memoryItemId };
}

async function handleIndexEntity(args: Record<string, unknown>) {
    const entityIndexId = (args.entity_index_id as string) || generateUUID();
    const row: EntityIndexRow = {
        id: entityIndexId,
        entity: args.entity as string,
        source_type: args.source_type as 'attachment' | 'memory' | 'message',
        source_id: args.source_id as string,
        weight: args.weight as number,
        created_at: args.created_at as number,
    };
    await insertEntityIndex(row);
    return { entity_index_id: entityIndexId };
}

async function handleSearchMemory(args: Record<string, unknown>) {
    const items = await searchMemory({
        text: (args.text as string) ?? null,
        tags: (args.tags as string[]) ?? null,
        tag_mode: (args.tag_mode as 'and' | 'or') ?? null,
        date_from: (args.date_from as number) ?? null,
        date_to: (args.date_to as number) ?? null,
        limit: args.limit as number,
    });

    const attachmentIds = Array.from(
        new Set(
            items
                .map((item) => item.attachment_id)
                .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
    );

    const bundleEntries = await Promise.all(
        attachmentIds.map(async (attachmentId) => [
            attachmentId,
            await getAttachmentBundle({ attachment_id: attachmentId }),
        ] as const)
    );
    const bundleByAttachmentId = new Map(bundleEntries);

    return {
        items: items.map((item) => ({
            ...item,
            attachment_bundle: item.attachment_id
                ? (bundleByAttachmentId.get(item.attachment_id) ?? null)
                : null,
        })),
    };
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
