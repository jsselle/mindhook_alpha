export const SCHEMA_VERSION = 5;

export const DDL_STATEMENTS = `
PRAGMA foreign_keys = ON;

-- Messages table (user, assistant, system messages)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  text TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Attachments table (media files metadata)
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('image', 'audio', 'video', 'file')),
  mime TEXT NOT NULL,
  local_path TEXT NOT NULL,
  size_bytes INTEGER,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  created_at INTEGER NOT NULL
);

-- Junction table for message-attachment relationship
CREATE TABLE IF NOT EXISTS message_attachments (
  message_id TEXT NOT NULL,
  attachment_id TEXT NOT NULL,
  position INTEGER,
  PRIMARY KEY (message_id, attachment_id),
  FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY(attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_msg_attach_msg ON message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_msg_attach_attach ON message_attachments(attachment_id);

-- AI-generated metadata for attachments
CREATE TABLE IF NOT EXISTS attachment_metadata (
  id TEXT PRIMARY KEY,
  attachment_id TEXT NOT NULL,
  model TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('transcript', 'scene', 'entities', 'summary', 'claims')),
  text TEXT,
  tags_json TEXT,
  event_at INTEGER,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_metadata_attachment ON attachment_metadata(attachment_id);
CREATE INDEX IF NOT EXISTS idx_metadata_kind ON attachment_metadata(kind);

-- Normalized tags index for metadata + memory search
CREATE TABLE IF NOT EXISTS memory_tags (
  source_type TEXT NOT NULL CHECK(source_type IN ('memory', 'attachment_metadata')),
  source_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (source_type, source_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_memory_tags_tag ON memory_tags(tag);
CREATE INDEX IF NOT EXISTS idx_memory_tags_source ON memory_tags(source_type, source_id);

-- Full-text search index across normalized memory + metadata text
CREATE VIRTUAL TABLE IF NOT EXISTS memory_search_fts USING fts5(
  source_type UNINDEXED,
  source_id UNINDEXED,
  text
);

-- Durable memory facts (SPO triples)
CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('object_location', 'habit', 'event', 'fact')),
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  text TEXT,
  tags_json TEXT,
  event_at INTEGER,
  time_anchor INTEGER,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  source_attachment_id TEXT,
  source_message_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_subject ON memory_items(subject);
CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_items(type);
CREATE INDEX IF NOT EXISTS idx_memory_time ON memory_items(time_anchor);

-- Entity index for fast lookups
CREATE TABLE IF NOT EXISTS entity_index (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('attachment', 'memory', 'message')),
  source_id TEXT NOT NULL,
  weight REAL NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entity_term ON entity_index(entity);

-- Reminders table for device-managed reminder lifecycle
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT,
  notes TEXT,
  due_at INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('scheduled', 'triggered', 'snoozed', 'completed', 'deleted')),
  source_message_id TEXT,
  source_run_id TEXT,
  pre_alert_minutes INTEGER NOT NULL DEFAULT 5,
  due_notification_id TEXT,
  pre_notification_id TEXT,
  delivered_at INTEGER,
  completed_at INTEGER,
  deleted_at INTEGER,
  deleted_reason TEXT,
  last_error TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_status_due ON reminders(status, due_at);
CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at);
CREATE INDEX IF NOT EXISTS idx_reminders_created_at ON reminders(created_at);

CREATE TABLE IF NOT EXISTS reminder_events (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'created',
    'updated',
    'scheduled_notifications',
    'pre_alert_triggered',
    'due_triggered',
    'snoozed',
    'completed',
    'deleted',
    'reply_requested',
    'reply_sent_to_llm',
    'schedule_error'
  )),
  event_at INTEGER NOT NULL,
  actor TEXT NOT NULL CHECK(actor IN ('llm', 'user', 'system')),
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(reminder_id) REFERENCES reminders(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reminder_events_reminder ON reminder_events(reminder_id, event_at DESC);

CREATE TABLE IF NOT EXISTS pending_reminder_replies (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  typed_text TEXT,
  notification_action_id TEXT NOT NULL,
  trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('due')),
  created_at INTEGER NOT NULL,
  consumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pending_reminder_replies_unconsumed ON pending_reminder_replies(consumed_at, created_at);
`;
