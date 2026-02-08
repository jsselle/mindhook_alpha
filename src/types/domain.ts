// ===== ENUMS (string enums, strict parsing) =====

export type Role = 'user' | 'assistant' | 'system';
export type AttachmentType = 'image' | 'audio' | 'video' | 'file';
export type MetadataKind = 'transcript' | 'scene' | 'entities' | 'summary' | 'claims';
export type MemoryType = 'object_location' | 'habit' | 'event' | 'fact';
export type EntitySourceType = 'attachment' | 'memory' | 'message';

// ===== ROW TYPES (match SQLite schema) =====

export interface MessageRow {
    id: string;           // UUID v4
    role: Role;
    text: string | null;
    created_at: number;   // Unix epoch ms
}

export interface AttachmentRow {
    id: string;           // UUID v4
    type: AttachmentType;
    mime: string;
    local_path: string;   // file:// URI
    size_bytes: number | null;
    duration_ms: number | null;
    width: number | null;
    height: number | null;
    created_at: number;   // Unix epoch ms
}

export interface MessageAttachmentLink {
    message_id: string;
    attachment_id: string;
    position: number | null;
}

export interface AttachmentMetadataRow {
    id: string;           // UUID v4
    attachment_id: string;
    model: string;
    kind: MetadataKind;
    text: string | null;
    tags_json: string | null;
    event_at: number | null;
    payload_json: string; // JSON.stringify(payload)
    created_at: number;   // Unix epoch ms
}

export interface MemoryItemRow {
    id: string;           // UUID v4
    type: MemoryType;
    subject: string;
    predicate: string;
    object: string;
    text: string | null;
    tags_json: string | null;
    event_at: number | null;
    time_anchor: number | null;
    confidence: number;   // 0..1
    source_attachment_id: string | null;
    source_message_id: string | null;
    created_at: number;   // Unix epoch ms
}

export interface EntityIndexRow {
    id: string;           // UUID v4
    entity: string;
    source_type: EntitySourceType;
    source_id: string;
    weight: number;       // 0..1 or ranking
    created_at: number;   // Unix epoch ms
}

export interface MemoryTagRow {
    source_type: 'memory' | 'attachment_metadata';
    source_id: string;
    tag: string;
    created_at: number;
}

// ===== CITATION TYPE (for retrieval) =====

export interface Citation {
    kind: 'attachment' | 'message' | 'memory';
    attachment_id?: string;
    message_id?: string;
    memory_item_id?: string;
    metadata_kind?: MetadataKind;
    note?: string;
}
