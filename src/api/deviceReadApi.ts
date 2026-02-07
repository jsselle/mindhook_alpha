import { getDatabase } from '../db/connection';
import {
    AttachmentRow,
    AttachmentType,
    MemoryItemRow,
    MemoryType,
    MessageRow,
    MetadataKind
} from '../types/domain';
import { nowMs } from '../utils/time';

export interface AttachmentBundle {
    attachment: AttachmentRow;
    metadata: Array<{
        kind: MetadataKind;
        model: string;
        created_at: number;
        payload: unknown;
    }>;
}

export const searchMemory = async (args: {
    subject?: string | null;
    type?: MemoryType | null;
    recent_days?: number | null;
    limit: number;
}): Promise<MemoryItemRow[]> => {
    const db = getDatabase();

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (args.subject) {
        conditions.push('subject = ?');
        params.push(args.subject);
    }
    if (args.type) {
        conditions.push('type = ?');
        params.push(args.type);
    }
    if (args.recent_days) {
        conditions.push('created_at >= ?');
        params.push(nowMs() - args.recent_days * 86400000);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await db.getAllAsync<MemoryItemRow>(
        `SELECT * FROM memory_items ${whereClause} 
     ORDER BY confidence DESC, created_at DESC 
     LIMIT ?`,
        [...params, args.limit]
    );

    return rows;
};

export const searchAttachments = async (args: {
    entities: string[];
    types?: AttachmentType[] | null;
    recent_days?: number | null;
    limit: number;
}): Promise<AttachmentRow[]> => {
    const db = getDatabase();

    if (args.entities.length === 0) return [];

    const entityPlaceholders = args.entities.map(() => '?').join(', ');
    const params: (string | number)[] = [...args.entities];

    let typeFilter = '';
    if (args.types && args.types.length > 0) {
        const typePlaceholders = args.types.map(() => '?').join(', ');
        typeFilter = `AND a.type IN (${typePlaceholders})`;
        params.push(...args.types);
    }

    let timeFilter = '';
    if (args.recent_days) {
        timeFilter = 'AND a.created_at >= ?';
        params.push(nowMs() - args.recent_days * 86400000);
    }

    params.push(args.limit);

    const rows = await db.getAllAsync<AttachmentRow>(
        `SELECT DISTINCT a.* FROM attachments a
     INNER JOIN entity_index ei ON ei.source_id = a.id AND ei.source_type = 'attachment'
     WHERE ei.entity IN (${entityPlaceholders})
     ${typeFilter}
     ${timeFilter}
     ORDER BY ei.weight DESC, a.created_at DESC
     LIMIT ?`,
        params
    );

    return rows;
};

export const getAttachmentBundle = async (args: {
    attachment_id: string;
}): Promise<AttachmentBundle | null> => {
    const db = getDatabase();

    const attachment = await db.getFirstAsync<AttachmentRow>(
        `SELECT * FROM attachments WHERE id = ?`,
        [args.attachment_id]
    );

    if (!attachment) return null;

    const metadataRows = await db.getAllAsync<{
        kind: MetadataKind;
        model: string;
        created_at: number;
        payload_json: string;
    }>(
        `SELECT kind, model, created_at, payload_json FROM attachment_metadata 
     WHERE attachment_id = ? ORDER BY created_at ASC`,
        [args.attachment_id]
    );

    return {
        attachment,
        metadata: metadataRows.map(row => ({
            kind: row.kind,
            model: row.model,
            created_at: row.created_at,
            payload: JSON.parse(row.payload_json),
        })),
    };
};

export const getMessageWithAttachments = async (args: {
    message_id: string;
}): Promise<{ message: MessageRow; attachments: AttachmentRow[] } | null> => {
    const db = getDatabase();

    const message = await db.getFirstAsync<MessageRow>(
        `SELECT * FROM messages WHERE id = ?`,
        [args.message_id]
    );

    if (!message) return null;

    const attachments = await db.getAllAsync<AttachmentRow>(
        `SELECT a.* FROM attachments a
     INNER JOIN message_attachments ma ON ma.attachment_id = a.id
     WHERE ma.message_id = ?
     ORDER BY ma.position ASC`,
        [args.message_id]
    );

    return { message, attachments };
};

export const getRecentMessages = async (args: {
    limit: number;
}): Promise<Array<{ id: string; role: string; text: string | null; created_at: number }>> => {
    const db = getDatabase();

    return await db.getAllAsync(
        `SELECT id, role, text, created_at FROM messages 
     ORDER BY created_at DESC LIMIT ?`,
        [args.limit]
    );
};
