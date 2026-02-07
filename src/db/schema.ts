export const SCHEMA_VERSION = 1;

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
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(attachment_id) REFERENCES attachments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_metadata_attachment ON attachment_metadata(attachment_id);
CREATE INDEX IF NOT EXISTS idx_metadata_kind ON attachment_metadata(kind);

-- Durable memory facts (SPO triples)
CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('object_location', 'habit', 'event', 'fact')),
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
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
`;
