/**
 * Ingestion payload type definitions for attachment metadata.
 * These types define the structure of metadata payloads stored via tools.
 */

/**
 * Transcript metadata for audio attachments.
 */
export interface TranscriptPayload {
    /** Full transcription text */
    text: string;
    /** Detected language code (e.g., 'en', 'es') */
    language?: string;
    /** Transcription confidence 0-1 */
    confidence?: number;
    /** Time-aligned segments */
    segments?: Array<{
        start_ms: number;
        end_ms: number;
        text: string;
    }>;
}

/**
 * Scene metadata for image attachments.
 */
export interface ScenePayload {
    /** Natural language description of the scene */
    description: string;
    /** Detected objects in the image */
    objects: string[];
    /** Detected activities/actions */
    actions?: string[];
    /** OCR text content if present */
    text_content?: string;
    /** Inferred location hint */
    location_hint?: string;
}

/**
 * Entity type for extracted entities.
 */
export type EntityType = 'person' | 'object' | 'location' | 'organization' | 'concept';

/**
 * Entities metadata for all attachment types.
 */
export interface EntitiesPayload {
    entities: Array<{
        /** Normalized entity name */
        name: string;
        /** Entity type classification */
        type: EntityType;
        /** Confidence score 0-1 */
        confidence: number;
        /** Number of mentions */
        mentions: number;
    }>;
}

/**
 * Union of all metadata payload types.
 */
export type MetadataPayload = TranscriptPayload | ScenePayload | EntitiesPayload;

/**
 * Metadata kind discriminator.
 */
export type MetadataKind = 'transcript' | 'scene' | 'entities' | 'summary' | 'claims';
