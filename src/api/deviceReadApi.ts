import { getDatabase } from "../db/connection";
import {
  AttachmentRow,
  AttachmentType,
  MessageRow,
  MetadataKind,
  ReminderEventRow,
  ReminderRow,
  ReminderStatus,
} from "../types/domain";
import { nowMs } from "../utils/time";

export interface AttachmentBundle {
  attachment: AttachmentRow;
  metadata: Array<{
    kind: MetadataKind;
    model: string;
    created_at: number;
    payload: unknown;
  }>;
}

export interface MemorySearchResult {
  id: string;
  source_type: "memory" | "attachment_metadata";
  memory_item_id: string | null;
  metadata_id: string | null;
  attachment_id: string | null;
  text: string | null;
  tags: string[];
  event_at: number | null;
  created_at: number;
  score: number;
}

export const searchMemory = async (args: {
  text?: string | null;
  tags?: string[] | null;
  tag_mode?: "and" | "or" | null;
  date_from?: number | null;
  date_to?: number | null;
  limit: number;
}): Promise<MemorySearchResult[]> => {
  const db = getDatabase();

  const normalizedTags = (args.tags ?? [])
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
  const normalizedText = normalizeSearchText(args.text);
  const tagMode: "and" | "or" = args.tag_mode === "or" ? "or" : "and";
  const perSourceLimit = Math.max(args.limit * 3, 30);

  const ftsRankByMemoryId = new Map<string, number>();
  const ftsRankByMetadataId = new Map<string, number>();

  if (normalizedText) {
    const ftsQuery = buildFtsQuery(normalizedText);
    if (!ftsQuery) {
      return [];
    }

    const ftsMemoryRows = await db.getAllAsync<{
      source_id: string;
      fts_rank: number;
    }>(
      `SELECT source_id, bm25(memory_search_fts) as fts_rank
             FROM memory_search_fts
             WHERE source_type = 'memory' AND memory_search_fts MATCH ?
             LIMIT ?`,
      [ftsQuery, perSourceLimit],
    );
    const ftsMetadataRows = await db.getAllAsync<{
      source_id: string;
      fts_rank: number;
    }>(
      `SELECT source_id, bm25(memory_search_fts) as fts_rank
             FROM memory_search_fts
             WHERE source_type = 'attachment_metadata' AND memory_search_fts MATCH ?
             LIMIT ?`,
      [ftsQuery, perSourceLimit],
    );

    for (const row of ftsMemoryRows) {
      ftsRankByMemoryId.set(row.source_id, row.fts_rank);
    }
    for (const row of ftsMetadataRows) {
      ftsRankByMetadataId.set(row.source_id, row.fts_rank);
    }

    if (ftsRankByMemoryId.size === 0 && ftsRankByMetadataId.size === 0) {
      return [];
    }
  }

  const memoryConditions: string[] = [];
  const memoryParams: Array<string | number> = [];

  if (ftsRankByMemoryId.size > 0) {
    const placeholders = Array.from(ftsRankByMemoryId.keys())
      .map(() => "?")
      .join(", ");
    memoryConditions.push(`id IN (${placeholders})`);
    memoryParams.push(...Array.from(ftsRankByMemoryId.keys()));
  } else if (normalizedText) {
    memoryConditions.push(`1 = 0`);
  }
  if (args.date_from != null) {
    memoryConditions.push(`COALESCE(event_at, time_anchor, created_at) >= ?`);
    memoryParams.push(args.date_from);
  }
  if (args.date_to != null) {
    memoryConditions.push(`COALESCE(event_at, time_anchor, created_at) <= ?`);
    memoryParams.push(args.date_to);
  }
  if (normalizedTags.length > 0) {
    if (tagMode === "and") {
      for (const tag of normalizedTags) {
        memoryConditions.push(
          `EXISTS (
                        SELECT 1 FROM memory_tags mt
                        WHERE mt.source_type = 'memory'
                          AND mt.source_id = memory_items.id
                          AND mt.tag = ?
                     )`,
        );
        memoryParams.push(tag);
      }
    } else {
      const placeholders = normalizedTags.map(() => "?").join(", ");
      memoryConditions.push(
        `EXISTS (
                    SELECT 1 FROM memory_tags mt
                    WHERE mt.source_type = 'memory'
                      AND mt.source_id = memory_items.id
                      AND mt.tag IN (${placeholders})
                 )`,
      );
      memoryParams.push(...normalizedTags);
    }
  }

  const memoryWhere =
    memoryConditions.length > 0
      ? `WHERE ${memoryConditions.join(" AND ")}`
      : "";
  const memoryRows = await db.getAllAsync<{
    id: string;
    attachment_id: string | null;
    text: string | null;
    tags_json: string | null;
    event_at: number | null;
    created_at: number;
  }>(
    `SELECT 
          id,
          source_attachment_id as attachment_id,
          COALESCE(text, subject || ' ' || predicate || ' ' || object) as text,
          tags_json,
          COALESCE(event_at, time_anchor, created_at) as event_at,
          created_at
         FROM memory_items
         ${memoryWhere}
         ORDER BY event_at DESC, created_at DESC
         LIMIT ?`,
    [...memoryParams, perSourceLimit],
  );

  const metadataConditions: string[] = [];
  const metadataParams: Array<string | number> = [];

  if (ftsRankByMetadataId.size > 0) {
    const placeholders = Array.from(ftsRankByMetadataId.keys())
      .map(() => "?")
      .join(", ");
    metadataConditions.push(`id IN (${placeholders})`);
    metadataParams.push(...Array.from(ftsRankByMetadataId.keys()));
  } else if (normalizedText) {
    metadataConditions.push(`1 = 0`);
  }
  if (args.date_from != null) {
    metadataConditions.push(`COALESCE(event_at, created_at) >= ?`);
    metadataParams.push(args.date_from);
  }
  if (args.date_to != null) {
    metadataConditions.push(`COALESCE(event_at, created_at) <= ?`);
    metadataParams.push(args.date_to);
  }
  if (normalizedTags.length > 0) {
    if (tagMode === "and") {
      for (const tag of normalizedTags) {
        metadataConditions.push(
          `EXISTS (
                        SELECT 1 FROM memory_tags mt
                        WHERE mt.source_type = 'attachment_metadata'
                          AND mt.source_id = attachment_metadata.id
                          AND mt.tag = ?
                     )`,
        );
        metadataParams.push(tag);
      }
    } else {
      const placeholders = normalizedTags.map(() => "?").join(", ");
      metadataConditions.push(
        `EXISTS (
                    SELECT 1 FROM memory_tags mt
                    WHERE mt.source_type = 'attachment_metadata'
                      AND mt.source_id = attachment_metadata.id
                      AND mt.tag IN (${placeholders})
                 )`,
      );
      metadataParams.push(...normalizedTags);
    }
  }

  const metadataWhere =
    metadataConditions.length > 0
      ? `WHERE ${metadataConditions.join(" AND ")}`
      : "";
  const metadataRows = await db.getAllAsync<{
    id: string;
    attachment_id: string;
    text: string | null;
    tags_json: string | null;
    event_at: number | null;
    created_at: number;
  }>(
    `SELECT
          id,
          attachment_id,
          COALESCE(text, payload_json) as text,
          tags_json,
          COALESCE(event_at, created_at) as event_at,
          created_at
         FROM attachment_metadata
         ${metadataWhere}
         ORDER BY event_at DESC, created_at DESC
         LIMIT ?`,
    [...metadataParams, perSourceLimit],
  );

  const parseTags = (raw: string | null): string[] => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((v) => typeof v === "string")
        : [];
    } catch {
      return [];
    }
  };

  const combined: MemorySearchResult[] = [
    ...memoryRows.map((row) => ({
      id: row.id,
      source_type: "memory" as const,
      memory_item_id: row.id,
      metadata_id: null,
      attachment_id: row.attachment_id,
      text: row.text,
      tags: parseTags(row.tags_json),
      event_at: row.event_at,
      created_at: row.created_at,
      score: scoreResult({
        sourceType: "memory",
        textQuery: normalizedText,
        tagsQuery: normalizedTags,
        tags: parseTags(row.tags_json),
        eventAt: row.event_at,
        createdAt: row.created_at,
        ftsRank: ftsRankByMemoryId.get(row.id),
      }),
    })),
    ...metadataRows.map((row) => ({
      id: row.id,
      source_type: "attachment_metadata" as const,
      memory_item_id: null,
      metadata_id: row.id,
      attachment_id: row.attachment_id,
      text: row.text,
      tags: parseTags(row.tags_json),
      event_at: row.event_at,
      created_at: row.created_at,
      score: scoreResult({
        sourceType: "attachment_metadata",
        textQuery: normalizedText,
        tagsQuery: normalizedTags,
        tags: parseTags(row.tags_json),
        eventAt: row.event_at,
        createdAt: row.created_at,
        ftsRank: ftsRankByMetadataId.get(row.id),
      }),
    })),
  ];

  combined.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.event_at ?? a.created_at;
    const bTime = b.event_at ?? b.created_at;
    return bTime - aTime;
  });

  return combined.slice(0, args.limit);
};

const normalizeSearchText = (text: string | null | undefined): string => {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const buildFtsQuery = (normalizedText: string): string => {
  const terms = normalizedText
    .split(" ")
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 12);

  if (terms.length === 0) return "";
  return terms.map((term) => `${term}*`).join(" OR ");
};

const scoreResult = (args: {
  sourceType: "memory" | "attachment_metadata";
  textQuery: string;
  tagsQuery: string[];
  tags: string[];
  eventAt: number | null;
  createdAt: number;
  ftsRank: number | undefined;
}): number => {
  let score = 0;

  if (args.textQuery) {
    if (args.ftsRank != null) {
      score += 60;
      // bm25 lower is better; keep contribution bounded.
      score += Math.max(0, 20 - Math.min(20, Math.abs(args.ftsRank) * 10));
    } else {
      score -= 20;
    }
  }

  if (args.tagsQuery.length > 0) {
    const tagSet = new Set(args.tags.map((tag) => tag.toLowerCase()));
    const matched = args.tagsQuery.filter((tag) => tagSet.has(tag)).length;
    score += matched * 8;
  }

  const when = args.eventAt ?? args.createdAt;
  const ageDays = Math.max(0, (Date.now() - when) / 86400000);
  score += Math.max(0, 20 - ageDays * 0.25);

  if (args.sourceType === "memory") {
    score += 4;
  }

  return Number(score.toFixed(4));
};

export const searchAttachments = async (args: {
  entities: string[];
  types?: AttachmentType[] | null;
  recent_days?: number | null;
  limit: number;
}): Promise<AttachmentRow[]> => {
  const db = getDatabase();

  if (args.entities.length === 0) return [];

  const entityPlaceholders = args.entities.map(() => "?").join(", ");
  const params: (string | number)[] = [...args.entities];

  let typeFilter = "";
  if (args.types && args.types.length > 0) {
    const typePlaceholders = args.types.map(() => "?").join(", ");
    typeFilter = `AND a.type IN (${typePlaceholders})`;
    params.push(...args.types);
  }

  let timeFilter = "";
  if (args.recent_days) {
    timeFilter = "AND a.created_at >= ?";
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
    params,
  );

  return rows;
};

export const getAttachmentBundle = async (args: {
  attachment_id: string;
}): Promise<AttachmentBundle | null> => {
  const db = getDatabase();

  const attachment = await db.getFirstAsync<AttachmentRow>(
    `SELECT * FROM attachments WHERE id = ?`,
    [args.attachment_id],
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
    [args.attachment_id],
  );

  return {
    attachment,
    metadata: metadataRows.map((row) => ({
      kind: row.kind,
      model: row.model,
      created_at: row.created_at,
      payload: JSON.parse(row.payload_json),
    })),
  };
};

export const attachmentExists = async (args: {
  attachment_id: string;
}): Promise<boolean> => {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM attachments WHERE id = ? LIMIT 1`,
    [args.attachment_id],
  );
  return !!row?.id;
};

export const getMessageWithAttachments = async (args: {
  message_id: string;
}): Promise<{ message: MessageRow; attachments: AttachmentRow[] } | null> => {
  const db = getDatabase();

  const message = await db.getFirstAsync<MessageRow>(
    `SELECT * FROM messages WHERE id = ?`,
    [args.message_id],
  );

  if (!message) return null;

  const attachments = await db.getAllAsync<AttachmentRow>(
    `SELECT a.* FROM attachments a
     INNER JOIN message_attachments ma ON ma.attachment_id = a.id
     WHERE ma.message_id = ?
     ORDER BY ma.position ASC`,
    [args.message_id],
  );

  return { message, attachments };
};

export const getRecentMessages = async (args: {
  limit: number;
}): Promise<
  Array<{ id: string; role: string; text: string | null; created_at: number }>
> => {
  const db = getDatabase();

  return await db.getAllAsync(
    `SELECT id, role, text, created_at FROM messages 
     ORDER BY created_at DESC LIMIT ?`,
    [args.limit],
  );
};

export const getReminderById = async (args: {
  reminder_id: string;
}): Promise<ReminderRow | null> => {
  const db = getDatabase();
  return await db.getFirstAsync<ReminderRow>(
    `SELECT * FROM reminders WHERE id = ? LIMIT 1`,
    [args.reminder_id],
  );
};

export const listReminders = async (args: {
  statuses?: ReminderStatus[] | null;
  include_deleted?: boolean;
  min_due_at?: number;
  limit: number;
  offset?: number;
}): Promise<ReminderRow[]> => {
  const db = getDatabase();
  const where: string[] = [];
  const params: Array<string | number> = [];

  if (!args.include_deleted) {
    where.push(`status != 'deleted'`);
  }

  const statuses = args.statuses ?? null;
  if (statuses && statuses.length > 0) {
    const placeholders = statuses.map(() => "?").join(", ");
    where.push(`status IN (${placeholders})`);
    params.push(...statuses);
  }

  if (args.min_due_at !== undefined) {
    where.push(`due_at >= ?`);
    params.push(args.min_due_at);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  params.push(args.limit);
  params.push(args.offset ?? 0);

  return await db.getAllAsync<ReminderRow>(
    `SELECT * FROM reminders
     ${whereClause}
     ORDER BY due_at ASC, created_at ASC
     LIMIT ? OFFSET ?`,
    params,
  );
};

export const listUpcomingReminders = async (args: {
  now_ms: number;
  horizon_ms: number;
  limit: number;
}): Promise<ReminderRow[]> => {
  const db = getDatabase();
  const maxDueAt = args.now_ms + args.horizon_ms;
  return await db.getAllAsync<ReminderRow>(
    `SELECT * FROM reminders
     WHERE status IN ('scheduled', 'snoozed')
       AND due_at >= ?
       AND due_at <= ?
     ORDER BY due_at ASC, created_at ASC
     LIMIT ?`,
    [args.now_ms, maxDueAt, args.limit],
  );
};

export const listReminderEvents = async (args: {
  reminder_id: string;
  limit: number;
}): Promise<ReminderEventRow[]> => {
  const db = getDatabase();
  return await db.getAllAsync<ReminderEventRow>(
    `SELECT * FROM reminder_events
     WHERE reminder_id = ?
     ORDER BY event_at DESC
     LIMIT ?`,
    [args.reminder_id, args.limit],
  );
};
