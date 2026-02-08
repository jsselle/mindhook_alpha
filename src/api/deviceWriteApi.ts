import { getDatabase } from '../db/connection';
import {
    AttachmentRow,
    EntityIndexRow,
    MemoryItemRow,
    MessageRow,
    MetadataKind
} from '../types/domain';

type TagSourceType = 'memory' | 'attachment_metadata';

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
