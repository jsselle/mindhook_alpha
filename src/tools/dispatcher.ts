import {
    attachmentExists,
    getAttachmentBundle,
    getMessageWithAttachments,
    messageExists,
    getRecentMessages,
    getReminderById,
    listReminders,
    searchMemory,
} from '../api/deviceReadApi';
import {
    insertAttachmentMetadata,
    insertEntityIndex,
    insertMemoryItem,
    insertReminder,
    insertReminderEvent,
    logicalDeleteReminder,
    updateReminder,
} from '../api/deviceWriteApi';
import {
    EntityIndexRow,
    MemoryItemRow,
    MemoryType,
    MetadataKind,
    ReminderRow,
    ReminderStatus,
} from '../types/domain';
import { nowMs } from '../utils/time';
import { generateUUID } from '../utils/uuid';

const REMINDER_PAST_DUE_GRACE_MS = 30000;
const REMINDER_MAX_FUTURE_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const DEFAULT_PRE_ALERT_MINUTES = 5;
const MAX_PRE_ALERT_MINUTES = 1440;

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

export interface ReminderNotificationScheduler {
    scheduleReminder(args: {
        reminder: ReminderRow;
        now_ms: number;
    }): Promise<{ due_notification_id: string | null; pre_notification_id: string | null }>;
    cancelReminderNotifications(args: { reminder: ReminderRow }): Promise<void>;
}

const noopReminderNotificationScheduler: ReminderNotificationScheduler = {
    async scheduleReminder() {
        return { due_notification_id: null, pre_notification_id: null };
    },
    async cancelReminderNotifications() {
        return;
    },
};

let reminderNotificationScheduler: ReminderNotificationScheduler = noopReminderNotificationScheduler;

export const setReminderNotificationScheduler = (
    scheduler: ReminderNotificationScheduler
): void => {
    reminderNotificationScheduler = scheduler;
};

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
        case 'create_reminder':
            return handleCreateReminder(args);
        case 'update_reminder':
            return handleUpdateReminder(args);
        case 'cancel_reminder':
            return handleCancelReminder(args);
        case 'list_reminders':
            return handleListReminders(args);
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
    const rawSourceMessageId = (args.source_message_id as string) ?? null;
    const safeSourceMessageId = await resolveValidSourceMessageId(rawSourceMessageId);
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
        source_message_id: safeSourceMessageId,
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

async function handleCreateReminder(args: Record<string, unknown>) {
    const now = nowMs();
    const title = asRequiredString(args.title, 'title');
    const dueAt = asRequiredNumber(args.due_at, 'due_at');
    const timezone = asRequiredString(args.timezone, 'timezone');
    const createdAt = asRequiredNumber(args.created_at, 'created_at');
    const preAlertMinutes = parsePreAlertMinutes(args.pre_alert_minutes);
    assertReminderDueAtValid(dueAt, now);

    const reminderId = (args.reminder_id as string) || generateUUID();
    const row: ReminderRow = {
        id: reminderId,
        title,
        topic: nullableString(args.topic),
        notes: nullableString(args.notes),
        due_at: dueAt,
        timezone,
        status: 'scheduled',
        source_message_id: nullableString(args.source_message_id),
        source_run_id: nullableString(args.source_run_id),
        pre_alert_minutes: preAlertMinutes,
        due_notification_id: null,
        pre_notification_id: null,
        delivered_at: null,
        completed_at: null,
        deleted_at: null,
        deleted_reason: null,
        last_error: null,
        metadata_json: null,
        created_at: createdAt,
        updated_at: createdAt,
    };

    await insertReminder(row);
    await insertReminderEvent({
        id: generateUUID(),
        reminder_id: row.id,
        event_type: 'created',
        event_at: createdAt,
        actor: 'llm',
        payload_json: JSON.stringify({
            source: 'create_reminder',
            due_at: dueAt,
            timezone,
            pre_alert_minutes: preAlertMinutes,
        }),
        created_at: createdAt,
    });

    try {
        const scheduling = await reminderNotificationScheduler.scheduleReminder({
            reminder: row,
            now_ms: now,
        });
        await updateReminder({
            id: row.id,
            patch: {
                due_notification_id: scheduling.due_notification_id,
                pre_notification_id: scheduling.pre_notification_id,
                last_error: null,
            },
            updated_at: createdAt,
            expected_updated_at: createdAt,
        });
        await insertReminderEvent({
            id: generateUUID(),
            reminder_id: row.id,
            event_type: 'scheduled_notifications',
            event_at: createdAt,
            actor: 'system',
            payload_json: JSON.stringify({
                due_notification_id: scheduling.due_notification_id,
                pre_notification_id: scheduling.pre_notification_id,
            }),
            created_at: createdAt,
        });
    } catch (error) {
        const scheduleMessage = error instanceof Error ? error.message : 'Unknown scheduling error';
        await updateReminder({
            id: row.id,
            patch: { last_error: scheduleMessage },
            updated_at: createdAt,
            expected_updated_at: createdAt,
        });
        await insertReminderEvent({
            id: generateUUID(),
            reminder_id: row.id,
            event_type: 'schedule_error',
            event_at: createdAt,
            actor: 'system',
            payload_json: JSON.stringify({ phase: 'create', error: scheduleMessage }),
            created_at: createdAt,
        });
        throw new ToolError(TOOL_ERROR_CODES.INTERNAL_ERROR, `Failed to schedule reminder: ${scheduleMessage}`, true);
    }

    return {
        reminder_id: row.id,
        status: row.status,
        due_at: row.due_at,
        pre_alert_at: row.due_at - preAlertMinutes * 60000,
    };
}

async function handleUpdateReminder(args: Record<string, unknown>) {
    const reminderId = asRequiredString(args.reminder_id, 'reminder_id');
    const updatedAt = asRequiredNumber(args.updated_at, 'updated_at');
    const now = nowMs();
    if (Object.prototype.hasOwnProperty.call(args, 'created_at')) {
        throw new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, 'created_at is immutable and cannot be updated');
    }
    const existing = await getReminderById({ reminder_id: reminderId });
    if (!existing) {
        throw new ToolError(TOOL_ERROR_CODES.FILE_NOT_FOUND, `Reminder not found: ${reminderId}`);
    }

    const patch: Partial<ReminderRow> = {};
    if (Object.prototype.hasOwnProperty.call(args, 'title')) {
        patch.title = asRequiredString(args.title, 'title');
    }
    if (Object.prototype.hasOwnProperty.call(args, 'topic')) {
        patch.topic = nullableOptionalString(args.topic, 'topic');
    }
    if (Object.prototype.hasOwnProperty.call(args, 'notes')) {
        patch.notes = nullableOptionalString(args.notes, 'notes');
    }
    if (Object.prototype.hasOwnProperty.call(args, 'due_at')) {
        patch.due_at = asRequiredNumber(args.due_at, 'due_at');
    }
    if (Object.prototype.hasOwnProperty.call(args, 'timezone')) {
        patch.timezone = asRequiredString(args.timezone, 'timezone');
    }
    if (Object.prototype.hasOwnProperty.call(args, 'pre_alert_minutes')) {
        patch.pre_alert_minutes = parsePreAlertMinutes(args.pre_alert_minutes);
    }
    if (Object.prototype.hasOwnProperty.call(args, 'status')) {
        const status = asRequiredString(args.status, 'status');
        assertValidReminderStatus(status);
        patch.status = status as ReminderStatus;
    }
    if (Object.keys(patch).length === 0) {
        throw new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, 'No updatable reminder fields provided');
    }

    if (patch.due_at != null) {
        assertReminderDueAtValid(patch.due_at, now);
    }
    if (patch.status === 'completed') {
        patch.completed_at = updatedAt;
    }
    if (patch.status === 'deleted') {
        patch.deleted_at = updatedAt;
        patch.deleted_reason = 'update_reminder_status_deleted';
    }

    try {
        await updateReminder({
            id: reminderId,
            patch,
            updated_at: updatedAt,
            expected_updated_at: existing.updated_at,
        });
    } catch (error) {
        throw mapReminderWriteError(error);
    }

    const updated = await getReminderById({ reminder_id: reminderId });
    if (!updated) {
        throw new ToolError(TOOL_ERROR_CODES.INTERNAL_ERROR, `Reminder not found after update: ${reminderId}`);
    }

    if (updated.status === 'deleted' || updated.status === 'completed') {
        await reminderNotificationScheduler.cancelReminderNotifications({ reminder: updated });
    } else {
        try {
            const scheduling = await reminderNotificationScheduler.scheduleReminder({
                reminder: updated,
                now_ms: now,
            });
            await updateReminder({
                id: reminderId,
                patch: {
                    due_notification_id: scheduling.due_notification_id,
                    pre_notification_id: scheduling.pre_notification_id,
                    last_error: null,
                },
                updated_at: updatedAt,
                expected_updated_at: updated.updated_at,
            });
            await insertReminderEvent({
                id: generateUUID(),
                reminder_id: reminderId,
                event_type: 'scheduled_notifications',
                event_at: updatedAt,
                actor: 'system',
                payload_json: JSON.stringify({
                    due_notification_id: scheduling.due_notification_id,
                    pre_notification_id: scheduling.pre_notification_id,
                }),
                created_at: updatedAt,
            });
        } catch (error) {
            const scheduleMessage = error instanceof Error ? error.message : 'Unknown scheduling error';
            await updateReminder({
                id: reminderId,
                patch: { last_error: scheduleMessage },
                updated_at: updatedAt,
                expected_updated_at: updated.updated_at,
            });
            await insertReminderEvent({
                id: generateUUID(),
                reminder_id: reminderId,
                event_type: 'schedule_error',
                event_at: updatedAt,
                actor: 'system',
                payload_json: JSON.stringify({ phase: 'update', error: scheduleMessage }),
                created_at: updatedAt,
            });
            throw new ToolError(TOOL_ERROR_CODES.INTERNAL_ERROR, `Failed to reschedule reminder: ${scheduleMessage}`, true);
        }
    }

    await insertReminderEvent({
        id: generateUUID(),
        reminder_id: reminderId,
        event_type: 'updated',
        event_at: updatedAt,
        actor: 'llm',
        payload_json: JSON.stringify({
            source: 'update_reminder',
            patch,
            previous_status: existing.status,
            next_status: updated.status,
        }),
        created_at: updatedAt,
    });

    return {
        reminder_id: reminderId,
        status: updated.status,
        due_at: updated.due_at,
        pre_alert_at: updated.due_at - updated.pre_alert_minutes * 60000,
    };
}

async function handleCancelReminder(args: Record<string, unknown>) {
    const reminderId = asRequiredString(args.reminder_id, 'reminder_id');
    const deletedAt = asRequiredNumber(args.deleted_at, 'deleted_at');
    const reason = (args.reason as string) ?? 'cancelled_by_user_or_llm';
    const actor = parseReminderEventActor(args.actor);
    const existing = await getReminderById({ reminder_id: reminderId });
    if (!existing) {
        throw new ToolError(TOOL_ERROR_CODES.FILE_NOT_FOUND, `Reminder not found: ${reminderId}`);
    }

    try {
        await logicalDeleteReminder({
            id: reminderId,
            deleted_at: deletedAt,
            reason,
            updated_at: deletedAt,
            expected_updated_at: existing.updated_at,
        });
    } catch (error) {
        throw mapReminderWriteError(error);
    }

    const deleted = await getReminderById({ reminder_id: reminderId });
    if (!deleted) {
        throw new ToolError(TOOL_ERROR_CODES.INTERNAL_ERROR, `Reminder not found after delete: ${reminderId}`);
    }

    await reminderNotificationScheduler.cancelReminderNotifications({ reminder: deleted });
    await insertReminderEvent({
        id: generateUUID(),
        reminder_id: reminderId,
        event_type: 'deleted',
        event_at: deletedAt,
        actor,
        payload_json: JSON.stringify({ reason, previous_status: existing.status }),
        created_at: deletedAt,
    });

    return {
        reminder_id: reminderId,
        status: 'deleted',
        deleted_at: deletedAt,
    };
}

async function handleListReminders(args: Record<string, unknown>) {
    const statuses = parseReminderStatuses(args.statuses);
    const includeDeleted = args.include_deleted === true;
    const limit = asPositiveInt(args.limit, 'limit');
    const offset = args.offset == null ? 0 : asNonNegativeInt(args.offset, 'offset');
    const reminders = await listReminders({
        statuses,
        include_deleted: includeDeleted,
        limit,
        offset,
    });
    return { reminders };
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

const asRequiredString = (value: unknown, field: string): string => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, `Missing or invalid ${field}`);
    }
    return value;
};

const asRequiredNumber = (value: unknown, field: string): number => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, `Missing or invalid ${field}`);
    }
    return value;
};

const asPositiveInt = (value: unknown, field: string): number => {
    const parsed = asRequiredNumber(value, field);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, `${field} must be a positive integer`);
    }
    return parsed;
};

const asNonNegativeInt = (value: unknown, field: string): number => {
    const parsed = asRequiredNumber(value, field);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, `${field} must be a non-negative integer`);
    }
    return parsed;
};

const nullableString = (value: unknown): string | null => {
    return typeof value === 'string' ? value : null;
};

const nullableOptionalString = (value: unknown, field: string): string | null => {
    if (value == null) return null;
    if (typeof value !== 'string') {
        throw new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, `Missing or invalid ${field}`);
    }
    return value;
};

const resolveValidSourceMessageId = async (
    sourceMessageId: string | null
): Promise<string | null> => {
    if (!sourceMessageId || sourceMessageId.trim().length === 0) {
        return null;
    }

    const exists = await messageExists({ message_id: sourceMessageId });
    return exists ? sourceMessageId : null;
};

const parsePreAlertMinutes = (value: unknown): number => {
    const normalized = value == null ? DEFAULT_PRE_ALERT_MINUTES : Number(value);
    if (!Number.isFinite(normalized) || normalized < 0 || normalized > MAX_PRE_ALERT_MINUTES) {
        throw new ToolError(
            TOOL_ERROR_CODES.INVALID_ARGS,
            `pre_alert_minutes must be between 0 and ${MAX_PRE_ALERT_MINUTES}`
        );
    }
    return normalized;
};

const assertReminderDueAtValid = (dueAt: number, now: number): void => {
    if (dueAt <= now - REMINDER_PAST_DUE_GRACE_MS) {
        throw new ToolError(
            TOOL_ERROR_CODES.INVALID_ARGS,
            'due_at must be in the future (with 30s grace)'
        );
    }
    if (dueAt > now + REMINDER_MAX_FUTURE_MS) {
        throw new ToolError(
            TOOL_ERROR_CODES.INVALID_ARGS,
            'due_at must be within 2 years'
        );
    }
};

const parseReminderStatuses = (value: unknown): ReminderStatus[] | null => {
    if (!Array.isArray(value)) return null;
    const statuses = value.map((entry) => String(entry)) as ReminderStatus[];
    for (const status of statuses) {
        assertValidReminderStatus(status);
    }
    return statuses;
};

const assertValidReminderStatus = (status: string): void => {
    const allowed: ReminderStatus[] = ['scheduled', 'triggered', 'snoozed', 'completed', 'deleted'];
    if (!allowed.includes(status as ReminderStatus)) {
        throw new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, `Invalid reminder status: ${status}`);
    }
};

const parseReminderEventActor = (value: unknown): 'llm' | 'user' | 'system' => {
    if (value == null) return 'llm';
    if (value === 'llm' || value === 'user' || value === 'system') {
        return value;
    }
    throw new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, `Invalid reminder event actor: ${String(value)}`);
};

const mapReminderWriteError = (error: unknown): ToolError => {
    if (error instanceof ToolError) return error;
    const message = error instanceof Error ? error.message : 'Unknown reminder write error';
    if (message.includes('not found')) {
        return new ToolError(TOOL_ERROR_CODES.FILE_NOT_FOUND, message);
    }
    if (message.includes('Invalid reminder status transition')) {
        return new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, message);
    }
    if (message.toLowerCase().includes('conflict')) {
        return new ToolError(TOOL_ERROR_CODES.INVALID_ARGS, message, true);
    }
    return new ToolError(TOOL_ERROR_CODES.INTERNAL_ERROR, message, false);
};
