import {
  ERROR_CODES,
  PROTOCOL_VERSION,
  type RunStartMessage,
} from "../types/messages.ts";

// Limits
export const MAX_ATTACHMENTS_PER_RUN = 6;
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_TOTAL_RUN_BYTES = 20 * 1024 * 1024; // 20 MB

// MIME allowlist
export const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mp4",
  "audio/m4a",
  "audio/aac",
  "audio/webm",
  "video/mp4",
  "video/webm",
]);

export interface ValidationResult {
  valid: boolean;
  error?: { code: string; message: string };
}

export const validateEnvelope = (msg: unknown): ValidationResult => {
  if (!msg || typeof msg !== "object") {
    return {
      valid: false,
      error: { code: ERROR_CODES.INVALID_MESSAGE, message: "Invalid JSON" },
    };
  }

  const envelope = msg as Record<string, unknown>;

  if (envelope.protocol_version !== PROTOCOL_VERSION) {
    return {
      valid: false,
      error: {
        code: ERROR_CODES.UNSUPPORTED_PROTOCOL,
        message: `Unsupported protocol version: ${envelope.protocol_version}`,
      },
    };
  }

  if (!envelope.type || !envelope.run_id || typeof envelope.seq !== "number") {
    return {
      valid: false,
      error: {
        code: ERROR_CODES.INVALID_MESSAGE,
        message: "Missing required fields",
      },
    };
  }

  return { valid: true };
};

export const validateRunStart = (msg: RunStartMessage): ValidationResult => {
  const contextMessages = msg.context?.messages;
  const userTime = msg.context?.user_time;
  if (contextMessages !== undefined) {
    if (!Array.isArray(contextMessages)) {
      return {
        valid: false,
        error: {
          code: ERROR_CODES.INVALID_MESSAGE,
          message: "context.messages must be an array",
        },
      };
    }

    for (const message of contextMessages) {
      if (!message || typeof message !== "object") {
        return {
          valid: false,
          error: {
            code: ERROR_CODES.INVALID_MESSAGE,
            message: "context.messages items must be objects",
          },
        };
      }
      if (message.role !== "user" && message.role !== "assistant") {
        return {
          valid: false,
          error: {
            code: ERROR_CODES.INVALID_MESSAGE,
            message: "context.messages role must be user or assistant",
          },
        };
      }
      if (typeof message.text !== "string") {
        return {
          valid: false,
          error: {
            code: ERROR_CODES.INVALID_MESSAGE,
            message: "context.messages text must be string",
          },
        };
      }
    }
  }

  if (userTime !== undefined) {
    if (!userTime || typeof userTime !== "object") {
      return {
        valid: false,
        error: {
          code: ERROR_CODES.INVALID_MESSAGE,
          message: "context.user_time must be an object",
        },
      };
    }
    if (typeof userTime.epoch_ms !== "number") {
      return {
        valid: false,
        error: {
          code: ERROR_CODES.INVALID_MESSAGE,
          message: "context.user_time.epoch_ms must be number",
        },
      };
    }
    if (typeof userTime.timezone !== "string") {
      return {
        valid: false,
        error: {
          code: ERROR_CODES.INVALID_MESSAGE,
          message: "context.user_time.timezone must be string",
        },
      };
    }
    if (typeof userTime.utc_offset_minutes !== "number") {
      return {
        valid: false,
        error: {
          code: ERROR_CODES.INVALID_MESSAGE,
          message: "context.user_time.utc_offset_minutes must be number",
        },
      };
    }
    if (typeof userTime.local_iso !== "string") {
      return {
        valid: false,
        error: {
          code: ERROR_CODES.INVALID_MESSAGE,
          message: "context.user_time.local_iso must be string",
        },
      };
    }
  }

  // Check attachment count
  if (msg.attachments.length > MAX_ATTACHMENTS_PER_RUN) {
    return {
      valid: false,
      error: {
        code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: `Too many attachments: ${msg.attachments.length} > ${MAX_ATTACHMENTS_PER_RUN}`,
      },
    };
  }

  let totalBytes = 0;
  for (const att of msg.attachments) {
    // Check individual size
    if (att.byte_length > MAX_ATTACHMENT_BYTES) {
      return {
        valid: false,
        error: {
          code: ERROR_CODES.PAYLOAD_TOO_LARGE,
          message: `Attachment ${att.attachment_id} too large: ${att.byte_length}`,
        },
      };
    }

    // Check MIME
    if (!ALLOWED_MIMES.has(att.mime)) {
      return {
        valid: false,
        error: {
          code: ERROR_CODES.UNSUPPORTED_MIME,
          message: `Unsupported MIME type: ${att.mime}`,
        },
      };
    }

    totalBytes += att.byte_length;
  }

  if (totalBytes > MAX_TOTAL_RUN_BYTES) {
    return {
      valid: false,
      error: {
        code: ERROR_CODES.PAYLOAD_TOO_LARGE,
        message: `Total payload too large: ${totalBytes}`,
      },
    };
  }

  return { valid: true };
};
