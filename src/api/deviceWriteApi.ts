import { getDatabase } from '../db/connection';
import {
    AttachmentRow,
    EntityIndexRow,
    MemoryItemRow,
    MessageRow,
    MetadataKind,
    ReminderEventRow,
    ReminderRow,
    ReminderStatus,
} from '../types/domain';

type TagSourceType = 'memory' | 'attachment_metadata';

const ALLOWED_REMINDER_STATUS_TRANSITIONS: Record<ReminderStatus, ReminderStatus[]> = {
    scheduled: ['triggered', 'snoozed', 'completed', 'deleted'],
    snoozed: ['triggered', 'snoozed', 'completed', 'deleted'],
    triggered: ['snoozed', 'completed', 'deleted'],
    completed: [],
    deleted: [],
};

export const insertMessage = async (row: MessageRow): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
        `INSERT OR REPLACE INTO messages (id, role, text, created_at) VALUES (?, ?, ?, ?)`,
        [row.id, row.role, row.text, row.created_at]
    );
};

export const insertAttachment = async (row: AttachmentRow): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
        `INSERT OR REPLACE INTO attachments 
     (id, type, mime, local_path, size_bytes, duration_ms, width, height, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.type, row.mime, row.local_path,
        row.size_bytes, row.duration_ms, row.width, row.height, row.created_at]
    );
};

export const deleteAttachmentById = async (attachmentId: string): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(`DELETE FROM attachments WHERE id = ?`, [attachmentId]);
};

export const linkMessageAttachment = async (args: {
    message_id: string;
    attachment_id: string;
    position?: number | null;
}): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
        `INSERT OR REPLACE INTO message_attachments (message_id, attachment_id, position) 
     VALUES (?, ?, ?)`,
        [args.message_id, args.attachment_id, args.position ?? null]
    );
};

export const insertAttachmentMetadata = async (args: {
    id: string;
    attachment_id: string;
    model: string;
    kind: MetadataKind;
    text?: string | null;
    tags?: string[] | null;
    event_at?: number | null;
    payload: unknown;
    created_at: number;
}): Promise<void> => {
    const db = getDatabase();
    const normalizedTags = normalizeTags(args.tags);
    const normalizedText = normalizeText(args.text);
    const payloadJson = JSON.stringify(args.payload);
    const tagsJson = normalizedTags.length > 0 ? JSON.stringify(normalizedTags) : null;
    await db.runAsync(
        `INSERT OR REPLACE INTO attachment_metadata 
     (id, attachment_id, model, kind, text, tags_json, event_at, payload_json, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            args.id,
            args.attachment_id,
            args.model,
            args.kind,
            normalizedText,
            tagsJson,
            args.event_at ?? null,
            payloadJson,
            args.created_at,
        ]
    );
    await replaceTags('attachment_metadata', args.id, normalizedTags, args.created_at);
    await replaceFtsText('attachment_metadata', args.id, normalizedText);
};

export const insertMemoryItem = async (row: MemoryItemRow): Promise<void> => {
    const db = getDatabase();
    const normalizedTags = normalizeTags(parseTagsJson(row.tags_json));
    const normalizedText = normalizeText(row.text);
    const tagsJson = normalizedTags.length > 0 ? JSON.stringify(normalizedTags) : null;
    await db.runAsync(
        `INSERT OR REPLACE INTO memory_items 
     (id, type, subject, predicate, object, text, tags_json, event_at, time_anchor, confidence, 
      source_attachment_id, source_message_id, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.type, row.subject, row.predicate, row.object,
        normalizedText, tagsJson, row.event_at, row.time_anchor, row.confidence, row.source_attachment_id,
        row.source_message_id, row.created_at]
    );
    await replaceTags('memory', row.id, normalizedTags, row.created_at);
    await replaceFtsText('memory', row.id, normalizedText);
};

export const insertEntityIndex = async (row: EntityIndexRow): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
        `INSERT OR REPLACE INTO entity_index 
     (id, entity, source_type, source_id, weight, created_at) 
     VALUES (?, ?, ?, ?, ?, ?)`,
        [row.id, row.entity, row.source_type, row.source_id, row.weight, row.created_at]
    );
};

export const insertReminder = async (row: ReminderRow): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
        `INSERT OR REPLACE INTO reminders
     (id, title, topic, notes, due_at, timezone, status, source_message_id, source_run_id,
      pre_alert_minutes, due_notification_id, pre_notification_id, delivered_at, completed_at,
      deleted_at, deleted_reason, last_error, metadata_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            row.id,
            row.title,
            row.topic,
            row.notes,
            row.due_at,
            row.timezone,
            row.status,
            row.source_message_id,
            row.source_run_id,
            row.pre_alert_minutes,
            row.due_notification_id,
            row.pre_notification_id,
            row.delivered_at,
            row.completed_at,
            row.deleted_at,
            row.deleted_reason,
            row.last_error,
            row.metadata_json,
            row.created_at,
            row.updated_at,
        ]
    );
};

export const updateReminder = async (args: {
    id: string;
    patch: Partial<ReminderRow>;
    updated_at: number;
    expected_updated_at?: number;
}): Promise<void> => {
    const db = getDatabase();
    const existing = await db.getFirstAsync<{ status: ReminderStatus; updated_at: number }>(
        `SELECT status, updated_at FROM reminders WHERE id = ? LIMIT 1`,
        [args.id]
    );

    if (!existing) {
        throw new Error(`Reminder not found: ${args.id}`);
    }
    if (args.expected_updated_at != null && existing.updated_at !== args.expected_updated_at) {
        throw new Error(`Reminder update conflict for id: ${args.id}`);
    }

    if (args.patch.status) {
        assertValidReminderStatusTransition(existing.status, args.patch.status);
    }

    const allowedPatchFields: Array<keyof ReminderRow> = [
        'title',
        'topic',
        'notes',
        'due_at',
        'timezone',
        'status',
        'source_message_id',
        'source_run_id',
        'pre_alert_minutes',
        'due_notification_id',
        'pre_notification_id',
        'delivered_at',
        'completed_at',
        'deleted_at',
        'deleted_reason',
        'last_error',
        'metadata_json',
    ];
    const entries = allowedPatchFields
        .filter((field) => Object.prototype.hasOwnProperty.call(args.patch, field))
        .map((field) => [field, args.patch[field]] as const);

    const setClauses = entries.map(([field]) => `${field} = ?`);
    const values = entries.map(([, value]) => value);

    setClauses.push('updated_at = ?');
    values.push(args.updated_at);
    const whereClauses = ['id = ?'];
    values.push(args.id);
    if (args.expected_updated_at != null) {
        whereClauses.push('updated_at = ?');
        values.push(args.expected_updated_at);
    }

    const result = await db.runAsync(
        `UPDATE reminders SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')}`,
        values
    );
    if (args.expected_updated_at != null && result?.changes === 0) {
        throw new Error(`Reminder update conflict for id: ${args.id}`);
    }
};

export const logicalDeleteReminder = async (args: {
    id: string;
    deleted_at: number;
    reason: string;
    updated_at: number;
    expected_updated_at?: number;
}): Promise<void> => {
    const db = getDatabase();
    const existing = await db.getFirstAsync<{ status: ReminderStatus; updated_at: number }>(
        `SELECT status, updated_at FROM reminders WHERE id = ? LIMIT 1`,
        [args.id]
    );

    if (!existing) {
        throw new Error(`Reminder not found: ${args.id}`);
    }
    if (args.expected_updated_at != null && existing.updated_at !== args.expected_updated_at) {
        throw new Error(`Reminder update conflict for id: ${args.id}`);
    }

    assertValidReminderStatusTransition(existing.status, 'deleted');

    const params: Array<string | number> = [args.deleted_at, args.reason, args.updated_at, args.id];
    let sql = `UPDATE reminders
     SET status = 'deleted', deleted_at = ?, deleted_reason = ?, updated_at = ?
     WHERE id = ?`;
    if (args.expected_updated_at != null) {
        sql += ` AND updated_at = ?`;
        params.push(args.expected_updated_at);
    }

    const result = await db.runAsync(sql, params);
    if (args.expected_updated_at != null && result?.changes === 0) {
        throw new Error(`Reminder update conflict for id: ${args.id}`);
    }
};

export const insertReminderEvent = async (row: ReminderEventRow): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
        `INSERT OR REPLACE INTO reminder_events
     (id, reminder_id, event_type, event_at, actor, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            row.id,
            row.reminder_id,
            row.event_type,
            row.event_at,
            row.actor,
            row.payload_json,
            row.created_at,
        ]
    );
};

const normalizeTags = (tags: string[] | null | undefined): string[] => {
    if (!tags || tags.length === 0) return [];
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const raw of tags) {
        if (typeof raw !== 'string') continue;
        const tag = raw.trim().toLowerCase();
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        normalized.push(tag);
    }

    return normalized;
};

const normalizeText = (text: string | null | undefined): string | null => {
    if (!text) return null;
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > 0 ? normalized : null;
};

const parseTagsJson = (tagsJson: string | null): string[] | null => {
    if (!tagsJson) return null;
    try {
        const parsed = JSON.parse(tagsJson);
        return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : null;
    } catch {
        return null;
    }
};

const replaceTags = async (
    sourceType: TagSourceType,
    sourceId: string,
    tags: string[],
    createdAt: number
): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
        `DELETE FROM memory_tags WHERE source_type = ? AND source_id = ?`,
        [sourceType, sourceId]
    );

    for (const tag of tags) {
        await db.runAsync(
            `INSERT OR REPLACE INTO memory_tags (source_type, source_id, tag, created_at)
             VALUES (?, ?, ?, ?)`,
            [sourceType, sourceId, tag, createdAt]
        );
    }
};

const replaceFtsText = async (
    sourceType: TagSourceType,
    sourceId: string,
    text: string | null
): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
        `DELETE FROM memory_search_fts WHERE source_type = ? AND source_id = ?`,
        [sourceType, sourceId]
    );

    if (text) {
        await db.runAsync(
            `INSERT INTO memory_search_fts (source_type, source_id, text) VALUES (?, ?, ?)`,
            [sourceType, sourceId, text]
        );
    }
};

const assertValidReminderStatusTransition = (
    fromStatus: ReminderStatus,
    toStatus: ReminderStatus
): void => {
    if (fromStatus === toStatus) return;
    const allowed = ALLOWED_REMINDER_STATUS_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) {
        throw new Error(`Invalid reminder status transition: ${fromStatus} -> ${toStatus}`);
    }
};
