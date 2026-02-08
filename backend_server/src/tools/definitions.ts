import { type FunctionDeclaration, Type } from "@google/genai";

export const getToolDefinitions = (): FunctionDeclaration[] => [
  // WRITE TOOLS
  {
    name: "store_attachment_metadata",
    description: "Persist LLM-generated metadata for an attachment on device",
    parameters: {
      type: Type.OBJECT,
      properties: {
        metadata_id: {
          type: Type.STRING,
          description:
            "Optional metadata record ID; runtime generates one if omitted",
        },
        attachment_id: {
          type: Type.STRING,
          description: "UUID of the attachment",
        },
        model: {
          type: Type.STRING,
          description: "Model that generated this metadata",
        },
        kind: {
          type: Type.STRING,
          enum: ["transcript", "scene", "entities", "summary", "claims"],
          description: "Type of metadata",
        },
        text: {
          type: Type.STRING,
          nullable: true,
          description:
            "Normalized searchable text (description/summary/transcript excerpt)",
        },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          nullable: true,
          description: "Normalized tags for retrieval (lowercase terms)",
        },
        event_at: {
          type: Type.INTEGER,
          nullable: true,
          description: "Event/observation timestamp in Unix epoch ms",
        },
        payload: { type: Type.OBJECT, description: "Metadata content" },
        created_at: { type: Type.INTEGER, description: "Unix epoch ms" },
        schema_version: { type: Type.STRING, enum: ["1"] },
      },
      required: [
        "attachment_id",
        "model",
        "kind",
        "payload",
        "created_at",
        "schema_version",
      ],
    },
  },
  {
    name: "store_memory_item",
    description: "Store a durable memory fact on device (SPO triple)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        memory_item_id: {
          type: Type.STRING,
          description: "Optional memory item ID; runtime generates one if omitted",
        },
        type: {
          type: Type.STRING,
          enum: ["object_location", "habit", "event", "fact"],
        },
        subject: { type: Type.STRING },
        predicate: { type: Type.STRING },
        object: { type: Type.STRING },
        text: {
          type: Type.STRING,
          nullable: true,
          description:
            "Normalized searchable memory text. If omitted, subject/predicate/object are used",
        },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          nullable: true,
          description: "Normalized retrieval tags (lowercase terms)",
        },
        event_at: {
          type: Type.INTEGER,
          nullable: true,
          description:
            "Memory event timestamp in Unix epoch ms (distinct from created_at)",
        },
        time_anchor: { type: Type.INTEGER, nullable: true },
        confidence: { type: Type.NUMBER, description: "0.0 to 1.0" },
        source_attachment_id: { type: Type.STRING, nullable: true },
        source_message_id: { type: Type.STRING, nullable: true },
        created_at: { type: Type.INTEGER },
        schema_version: { type: Type.STRING, enum: ["1"] },
      },
      required: [
        "type",
        "subject",
        "predicate",
        "object",
        "confidence",
        "created_at",
        "schema_version",
      ],
    },
  },
  {
    name: "index_entity",
    description: "Index an entity for fast device-side lookup",
    parameters: {
      type: Type.OBJECT,
      properties: {
        entity_index_id: {
          type: Type.STRING,
          description:
            "Optional entity index ID; runtime generates one if omitted",
        },
        entity: { type: Type.STRING, description: "Normalized entity name" },
        source_type: {
          type: Type.STRING,
          enum: ["attachment", "memory", "message"],
        },
        source_id: { type: Type.STRING },
        weight: { type: Type.NUMBER, description: "Relevance weight 0-1" },
        created_at: { type: Type.INTEGER },
        schema_version: { type: Type.STRING, enum: ["1"] },
      },
      required: [
        "entity",
        "source_type",
        "source_id",
        "weight",
        "created_at",
        "schema_version",
      ],
    },
  },
  {
    name: "create_reminder",
    description: "Create a device-managed reminder and schedule local notifications",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reminder_id: {
          type: Type.STRING,
          description: "Optional; runtime generates if omitted",
        },
        title: { type: Type.STRING, description: "Short reminder title" },
        topic: { type: Type.STRING, nullable: true },
        notes: { type: Type.STRING, nullable: true },
        due_at: {
          type: Type.INTEGER,
          description: "Unix epoch ms in user's local intent",
        },
        timezone: {
          type: Type.STRING,
          description: "IANA tz, e.g., America/Los_Angeles",
        },
        pre_alert_minutes: {
          type: Type.INTEGER,
          nullable: true,
          description: "Default 10",
        },
        source_message_id: { type: Type.STRING, nullable: true },
        source_run_id: { type: Type.STRING, nullable: true },
        created_at: { type: Type.INTEGER },
        schema_version: { type: Type.STRING, enum: ["1"] },
      },
      required: ["title", "due_at", "timezone", "created_at", "schema_version"],
    },
  },
  {
    name: "update_reminder",
    description: "Update reminder fields, including due date/time and notes; reschedules local notifications",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reminder_id: { type: Type.STRING },
        title: { type: Type.STRING, nullable: true },
        topic: { type: Type.STRING, nullable: true },
        notes: { type: Type.STRING, nullable: true },
        due_at: { type: Type.INTEGER, nullable: true },
        timezone: { type: Type.STRING },
        pre_alert_minutes: { type: Type.INTEGER, nullable: true },
        status: {
          type: Type.STRING,
          enum: ["scheduled", "snoozed", "completed", "deleted"],
          nullable: true,
        },
        updated_at: { type: Type.INTEGER },
        schema_version: { type: Type.STRING, enum: ["1"] },
      },
      required: ["reminder_id", "updated_at", "schema_version"],
    },
  },
  {
    name: "cancel_reminder",
    description: "Logical delete reminder and cancel any pending local notifications",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reminder_id: { type: Type.STRING },
        reason: { type: Type.STRING, nullable: true },
        deleted_at: { type: Type.INTEGER },
        schema_version: { type: Type.STRING, enum: ["1"] },
      },
      required: ["reminder_id", "deleted_at", "schema_version"],
    },
  },
  {
    name: "list_reminders",
    description: "List reminders sorted by due date ascending",
    parameters: {
      type: Type.OBJECT,
      properties: {
        statuses: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          nullable: true,
        },
        include_deleted: { type: Type.BOOLEAN, nullable: true },
        limit: { type: Type.INTEGER },
        offset: { type: Type.INTEGER, nullable: true },
        schema_version: { type: Type.STRING, enum: ["1"] },
      },
      required: ["limit", "schema_version"],
    },
  },

  // READ TOOLS
  {
    name: "search_memory",
    description:
      "Primary retrieval tool. Unified search across memory_items and attachment_metadata using text, tags, and date range. Attachment-based hits include enough attachment context for direct answering without follow-up bundle calls in most cases.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          nullable: true,
          description: "Free-text query against normalized searchable text",
        },
        tags: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          nullable: true,
          description: "Optional tags to filter by (synonyms encouraged)",
        },
        tag_mode: {
          type: Type.STRING,
          enum: ["and", "or"],
          nullable: true,
          description:
            "How tags are combined: and=all tags required, or=any tag matches",
        },
        date_from: {
          type: Type.INTEGER,
          nullable: true,
          description: "Inclusive lower bound (Unix epoch ms)",
        },
        date_to: {
          type: Type.INTEGER,
          nullable: true,
          description: "Inclusive upper bound (Unix epoch ms)",
        },
        limit: { type: Type.INTEGER },
        schema_version: { type: Type.STRING, enum: ["1"] },
      },
      required: ["limit", "schema_version"],
    },
  },
  {
    name: "recent_messages",
    description: "Return recent messages for context",
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: { type: Type.INTEGER },
        schema_version: { type: Type.STRING, enum: ["1"] },
      },
      required: ["limit", "schema_version"],
    },
  },
  {
    name: "get_message_with_attachments",
    description: "Return a message with its linked attachments",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message_id: { type: Type.STRING },
        schema_version: { type: Type.STRING, enum: ["1"] },
      },
      required: ["message_id", "schema_version"],
    },
  },
];
