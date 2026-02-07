import { FunctionDeclaration, Type } from '@google/genai';

export const getToolDefinitions = (): FunctionDeclaration[] => [
    // WRITE TOOLS
    {
        name: 'store_attachment_metadata',
        description: 'Persist LLM-generated metadata for an attachment on device',
        parameters: {
            type: Type.OBJECT,
            properties: {
                metadata_id: { type: Type.STRING, description: 'UUID for this metadata record' },
                attachment_id: { type: Type.STRING, description: 'UUID of the attachment' },
                model: { type: Type.STRING, description: 'Model that generated this metadata' },
                kind: {
                    type: Type.STRING,
                    enum: ['transcript', 'scene', 'entities', 'summary', 'claims'],
                    description: 'Type of metadata',
                },
                payload: { type: Type.OBJECT, description: 'Metadata content' },
                created_at: { type: Type.INTEGER, description: 'Unix epoch ms' },
                schema_version: { type: Type.STRING, enum: ['1'] },
            },
            required: ['metadata_id', 'attachment_id', 'model', 'kind', 'payload', 'created_at', 'schema_version'],
        },
    },
    {
        name: 'store_memory_item',
        description: 'Store a durable memory fact on device (SPO triple)',
        parameters: {
            type: Type.OBJECT,
            properties: {
                memory_item_id: { type: Type.STRING },
                type: {
                    type: Type.STRING,
                    enum: ['object_location', 'habit', 'event', 'fact'],
                },
                subject: { type: Type.STRING },
                predicate: { type: Type.STRING },
                object: { type: Type.STRING },
                time_anchor: { type: Type.INTEGER, nullable: true },
                confidence: { type: Type.NUMBER, description: '0.0 to 1.0' },
                source_attachment_id: { type: Type.STRING, nullable: true },
                source_message_id: { type: Type.STRING, nullable: true },
                created_at: { type: Type.INTEGER },
                schema_version: { type: Type.STRING, enum: ['1'] },
            },
            required: ['memory_item_id', 'type', 'subject', 'predicate', 'object', 'confidence', 'created_at', 'schema_version'],
        },
    },
    {
        name: 'index_entity',
        description: 'Index an entity for fast device-side lookup',
        parameters: {
            type: Type.OBJECT,
            properties: {
                entity_index_id: { type: Type.STRING },
                entity: { type: Type.STRING, description: 'Normalized entity name' },
                source_type: { type: Type.STRING, enum: ['attachment', 'memory', 'message'] },
                source_id: { type: Type.STRING },
                weight: { type: Type.NUMBER, description: 'Relevance weight 0-1' },
                created_at: { type: Type.INTEGER },
                schema_version: { type: Type.STRING, enum: ['1'] },
            },
            required: ['entity_index_id', 'entity', 'source_type', 'source_id', 'weight', 'created_at', 'schema_version'],
        },
    },

    // READ TOOLS
    {
        name: 'search_memory',
        description: 'Search memory_items using structured filters',
        parameters: {
            type: Type.OBJECT,
            properties: {
                subject: { type: Type.STRING, nullable: true },
                type: {
                    type: Type.STRING,
                    enum: ['object_location', 'habit', 'event', 'fact'],
                    nullable: true,
                },
                recent_days: { type: Type.INTEGER, nullable: true },
                limit: { type: Type.INTEGER },
                schema_version: { type: Type.STRING, enum: ['1'] },
            },
            required: ['limit', 'schema_version'],
        },
    },
    {
        name: 'search_attachments',
        description: 'Find attachments by indexed entities and optional filters',
        parameters: {
            type: Type.OBJECT,
            properties: {
                entities: { type: Type.ARRAY, items: { type: Type.STRING } },
                types: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING, enum: ['image', 'audio', 'video', 'file'] },
                    nullable: true,
                },
                recent_days: { type: Type.INTEGER, nullable: true },
                limit: { type: Type.INTEGER },
                schema_version: { type: Type.STRING, enum: ['1'] },
            },
            required: ['entities', 'limit', 'schema_version'],
        },
    },
    {
        name: 'get_attachment_bundle',
        description: 'Return attachment row + all metadata kinds for it',
        parameters: {
            type: Type.OBJECT,
            properties: {
                attachment_id: { type: Type.STRING },
                schema_version: { type: Type.STRING, enum: ['1'] },
            },
            required: ['attachment_id', 'schema_version'],
        },
    },
    {
        name: 'recent_messages',
        description: 'Return recent messages for context',
        parameters: {
            type: Type.OBJECT,
            properties: {
                limit: { type: Type.INTEGER },
                schema_version: { type: Type.STRING, enum: ['1'] },
            },
            required: ['limit', 'schema_version'],
        },
    },
    {
        name: 'get_message_with_attachments',
        description: 'Return a message with its linked attachments',
        parameters: {
            type: Type.OBJECT,
            properties: {
                message_id: { type: Type.STRING },
                schema_version: { type: Type.STRING, enum: ['1'] },
            },
            required: ['message_id', 'schema_version'],
        },
    },
];
