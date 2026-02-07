import { getDatabase } from '../db/connection';
import {
    AttachmentRow,
    EntityIndexRow,
    MemoryItemRow,
    MessageRow,
    MetadataKind
} from '../types/domain';

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
    payload: unknown;
    created_at: number;
}): Promise<void> => {
    const db = getDatabase();
    const payloadJson = JSON.stringify(args.payload);
    await db.runAsync(
        `INSERT OR REPLACE INTO attachment_metadata 
     (id, attachment_id, model, kind, payload_json, created_at) 
     VALUES (?, ?, ?, ?, ?, ?)`,
        [args.id, args.attachment_id, args.model, args.kind, payloadJson, args.created_at]
    );
};

export const insertMemoryItem = async (row: MemoryItemRow): Promise<void> => {
    const db = getDatabase();
    await db.runAsync(
        `INSERT OR REPLACE INTO memory_items 
     (id, type, subject, predicate, object, time_anchor, confidence, 
      source_attachment_id, source_message_id, created_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.id, row.type, row.subject, row.predicate, row.object,
        row.time_anchor, row.confidence, row.source_attachment_id,
        row.source_message_id, row.created_at]
    );
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
