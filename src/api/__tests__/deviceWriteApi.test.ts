import {
  getMockDatabase,
  resetMockDatabase,
} from "../../__mocks__/expo-sqlite";
import { getDatabase, setDatabaseInstance } from "../../db/connection";
import {
  insertAttachment,
  insertAttachmentMetadata,
  insertEntityIndex,
  insertMemoryItem,
  insertMessage,
  insertReminder,
  insertReminderEvent,
  linkMessageAttachment,
  logicalDeleteReminder,
  updateReminder,
} from "../deviceWriteApi";

describe("DeviceWriteAPI", () => {
  beforeEach(() => {
    resetMockDatabase();
    setDatabaseInstance(null);
  });

  describe("insertMessage", () => {
    it("inserts message with UPSERT", async () => {
      await insertMessage({
        id: "msg-1",
        role: "user",
        text: "Hello",
        created_at: 1700000000000,
      });

      const mockDb = getMockDatabase();
      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO messages"),
        ["msg-1", "user", "Hello", 1700000000000],
      );
    });
  });

  describe("insertAttachment", () => {
    it("inserts attachment with all fields", async () => {
      await insertAttachment({
        id: "att-1",
        type: "image",
        mime: "image/jpeg",
        local_path: "file:///path/to/image.jpg",
        size_bytes: 12345,
        duration_ms: null,
        width: 1024,
        height: 768,
        created_at: 1700000000000,
      });

      const mockDb = getMockDatabase();
      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO attachments"),
        expect.arrayContaining(["att-1", "image", "image/jpeg"]),
      );
    });
  });

  describe("insertMemoryItem", () => {
    it("inserts memory with SPO triple", async () => {
      await insertMemoryItem({
        id: "mem-1",
        type: "object_location",
        subject: "keys",
        predicate: "last_seen",
        object: "kitchen counter",
        text: "Keys were last seen on the kitchen counter",
        tags_json: JSON.stringify(["keys", "kitchen"]),
        event_at: 1700000000000,
        time_anchor: 1700000000000,
        confidence: 0.85,
        source_attachment_id: "att-1",
        source_message_id: null,
        created_at: 1700000000000,
      });

      const mockDb = getMockDatabase();
      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO memory_items"),
        expect.arrayContaining(["mem-1", "object_location", "keys"]),
      );
    });
  });

  describe("linkMessageAttachment", () => {
    it("links message to attachment", async () => {
      await linkMessageAttachment({
        message_id: "msg-1",
        attachment_id: "att-1",
        position: 0,
      });

      const mockDb = getMockDatabase();
      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO message_attachments"),
        ["msg-1", "att-1", 0],
      );
    });
  });

  describe("insertAttachmentMetadata", () => {
    it("inserts metadata with JSON payload", async () => {
      await insertAttachmentMetadata({
        id: "meta-1",
        attachment_id: "att-1",
        model: "gemini-3-flash-preview",
        kind: "transcript",
        payload: { text: "Hello world" },
        created_at: 1700000000000,
      });

      const mockDb = getMockDatabase();
      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO attachment_metadata"),
        expect.arrayContaining([
          "meta-1",
          "att-1",
          "gemini-3-flash-preview",
          "transcript",
        ]),
      );
    });
  });

  describe("insertEntityIndex", () => {
    it("inserts entity index entry", async () => {
      await insertEntityIndex({
        id: "ent-1",
        entity: "keys",
        source_type: "attachment",
        source_id: "att-1",
        weight: 0.9,
        created_at: 1700000000000,
      });

      const mockDb = getMockDatabase();
      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO entity_index"),
        expect.arrayContaining(["ent-1", "keys", "attachment", "att-1"]),
      );
    });
  });

  describe("reminders", () => {
    it("inserts reminder row", async () => {
      await insertReminder({
        id: "rem-1",
        title: "Pay bill",
        topic: "finance",
        notes: null,
        due_at: 1700000100000,
        timezone: "America/Los_Angeles",
        status: "scheduled",
        source_message_id: null,
        source_run_id: null,
        pre_alert_minutes: 10,
        due_notification_id: null,
        pre_notification_id: null,
        delivered_at: null,
        completed_at: null,
        deleted_at: null,
        deleted_reason: null,
        last_error: null,
        metadata_json: null,
        created_at: 1700000000000,
        updated_at: 1700000000000,
      });

      const mockDb = getMockDatabase();
      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO reminders"),
        expect.arrayContaining(["rem-1", "Pay bill", "finance"]),
      );
    });

    it("logicalDeleteReminder updates status to deleted", async () => {
      getDatabase();
      const mockDb = getMockDatabase();
      mockDb?.getFirstAsync.mockResolvedValueOnce({ status: "scheduled", updated_at: 1700000000000 });

      await logicalDeleteReminder({
        id: "rem-1",
        deleted_at: 1700000200000,
        reason: "user_cancelled",
        updated_at: 1700000200000,
      });

      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'deleted'"),
        [1700000200000, "user_cancelled", 1700000200000, "rem-1"],
      );
    });

    it("updateReminder throws on invalid status transition", async () => {
      getDatabase();
      const mockDb = getMockDatabase();
      mockDb?.getFirstAsync.mockResolvedValueOnce({ status: "completed", updated_at: 1700000000000 });

      await expect(
        updateReminder({
          id: "rem-1",
          patch: { status: "scheduled" },
          updated_at: 1700000200000,
        }),
      ).rejects.toThrow("Invalid reminder status transition");
    });

    it("updateReminder uses optimistic lock when expected_updated_at is provided", async () => {
      getDatabase();
      const mockDb = getMockDatabase();
      mockDb?.getFirstAsync.mockResolvedValueOnce({ status: "scheduled", updated_at: 1700000000000 });

      await updateReminder({
        id: "rem-1",
        patch: { title: "Updated title" },
        updated_at: 1700000200000,
        expected_updated_at: 1700000000000,
      });

      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("WHERE id = ? AND updated_at = ?"),
        ["Updated title", 1700000200000, "rem-1", 1700000000000],
      );
    });

    it("logicalDeleteReminder throws on optimistic lock conflict", async () => {
      getDatabase();
      const mockDb = getMockDatabase();
      mockDb?.getFirstAsync.mockResolvedValueOnce({ status: "scheduled", updated_at: 1700000000000 });
      mockDb?.runAsync.mockResolvedValueOnce({ changes: 0, lastInsertRowId: 1 });

      await expect(
        logicalDeleteReminder({
          id: "rem-1",
          deleted_at: 1700000200000,
          reason: "user_cancelled",
          updated_at: 1700000200000,
          expected_updated_at: 1700000000000,
        }),
      ).rejects.toThrow("Reminder update conflict");
    });

    it("inserts reminder events", async () => {
      await insertReminderEvent({
        id: "evt-1",
        reminder_id: "rem-1",
        event_type: "created",
        event_at: 1700000000000,
        actor: "llm",
        payload_json: null,
        created_at: 1700000000000,
      });

      const mockDb = getMockDatabase();
      expect(mockDb?.runAsync).toHaveBeenCalledWith(
        expect.stringContaining("INSERT OR REPLACE INTO reminder_events"),
        ["evt-1", "rem-1", "created", 1700000000000, "llm", null, 1700000000000],
      );
    });
  });
});
