import {
  getMockDatabase,
  resetMockDatabase,
} from "../../__mocks__/expo-sqlite";
import { setDatabaseInstance } from "../../db/connection";
import {
  insertAttachment,
  insertAttachmentMetadata,
  insertEntityIndex,
  insertMemoryItem,
  insertMessage,
  linkMessageAttachment,
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
});
