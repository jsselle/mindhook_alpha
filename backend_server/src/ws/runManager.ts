import { v4 as uuidv4 } from "uuid";
import { WebSocket } from "ws";
import {
  buildContents,
  type ConversationTurn,
  type StreamCallbacks,
  streamGeneration,
} from "../gemini/client.ts";
import { getFullSystemPrompt } from "../gemini/systemPrompt.ts";
import {
  type AssistantTokenMessage,
  type Citation,
  ERROR_CODES,
  type FinalResponseMessage,
  PROTOCOL_VERSION,
  type RunErrorMessage,
  type RunStartMessage,
  type StatusMessage,
  type ToolCallMessage,
  type ToolErrorMessage,
  type ToolResultMessage,
} from "../types/messages.ts";
import { validateEnvelope, validateRunStart } from "./protocol.ts";

type RunState =
  | "WAIT_RUN_START"
  | "PREPARE_MODEL"
  | "STREAM_OUTPUT"
  | "HANDLE_TOOL_CALL"
  | "FINALIZE"
  | "CLOSE";

interface PendingToolCall {
  call_id: string;
  tool: string;
  args: Record<string, unknown>;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class RunManager {
  private socket: WebSocket;
  private state: RunState = "WAIT_RUN_START";
  private runId: string = "";
  private seq: number = 0;
  private appVersion: string = "backend-1.0";
  private pendingToolCalls: Map<string, PendingToolCall> = new Map();
  private inFlightReminderToolCalls: Map<string, Promise<unknown>> = new Map();
  private completedReminderToolResults: Map<string, unknown> = new Map();
  private toolCallCount: number = 0;
  private toolErrorCount: number = 0;
  private fullResponseText: string = "";
  private citations: Citation[] = [];
  private connectionId: string;

  constructor(socket: WebSocket, connectionId = "ws") {
    this.socket = socket;
    this.connectionId = connectionId;
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.socket.on("message", (data) => this.handleMessage(data));
    this.socket.on("close", () => this.cleanup());
    this.socket.on("error", (err) => this.handleError(err));
  }

  private handleMessage(data: unknown): void {
    try {
      const msg = JSON.parse((data as Buffer | string).toString());
      this.logInbound(msg);
      const envValidation = validateEnvelope(msg);

      if (!envValidation.valid) {
        this.sendError(
          envValidation.error!.code,
          envValidation.error!.message,
          false,
        );
        return;
      }

      switch (msg.type) {
        case "run_start":
          this.handleRunStart(msg as RunStartMessage);
          break;
        case "tool_result":
          this.handleToolResult(msg as ToolResultMessage);
          break;
        case "tool_error":
          this.handleToolError(msg as ToolErrorMessage);
          break;
        default:
          this.sendError(
            ERROR_CODES.INVALID_MESSAGE,
            `Unknown message type: ${msg.type}`,
            false,
          );
      }
    } catch (e) {
      this.log("IN_PARSE_ERROR", {
        error: (e as Error).message,
      });
      this.sendError(
        ERROR_CODES.INVALID_MESSAGE,
        "Failed to parse message",
        false,
      );
    }
  }

  private async handleRunStart(msg: RunStartMessage): Promise<void> {
    if (this.state !== "WAIT_RUN_START") {
      this.sendError(ERROR_CODES.INVALID_MESSAGE, "Run already started", false);
      return;
    }

    const validation = validateRunStart(msg);
    if (!validation.valid) {
      this.sendError(validation.error!.code, validation.error!.message, false);
      return;
    }

    this.runId = msg.run_id;
    this.state = "PREPARE_MODEL";
    this.sendStatus("preparing_model", "Building request...");

    try {
      const contents = buildContents(
        getFullSystemPrompt(),
        msg.user.text,
        msg.attachments,
        this.mapConversationToTurns(msg.context?.messages),
        msg.context?.user_time,
      );

      this.state = "STREAM_OUTPUT";
      this.sendStatus("generating", "Generating response...");

      const callbacks: StreamCallbacks = {
        onToken: (text) => this.sendToken(text),
        onToolCall: (name, args) => this.relayToolCall(name, args),
        onComplete: (fullText) =>
          this.handleComplete(fullText, msg.user.message_id),
        onError: (error) => this.handleStreamError(error),
      };

      await streamGeneration(contents, callbacks);
    } catch (error) {
      this.sendError(
        ERROR_CODES.MODEL_UPSTREAM_ERROR,
        (error as Error).message,
        true,
      );
    }
  }

  private async relayToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const dedupeKey = this.getReminderMutationDedupeKey(name, args);
    if (dedupeKey) {
      if (this.completedReminderToolResults.has(dedupeKey)) {
        return this.completedReminderToolResults.get(dedupeKey);
      }

      const inFlight = this.inFlightReminderToolCalls.get(dedupeKey);
      if (inFlight) {
        return inFlight;
      }
    }

    this.state = "HANDLE_TOOL_CALL";
    this.toolCallCount++;

    const call_id = uuidv4();
    const timeout_ms = 15000;

    const toolCallPromise = new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingToolCalls.delete(call_id);
        this.toolErrorCount++;
        this.sendError(
          ERROR_CODES.TOOL_TIMEOUT,
          `Tool call timed out: ${name}`,
          true,
        );
        reject(new Error("Tool call timeout"));
      }, timeout_ms);

      this.pendingToolCalls.set(call_id, {
        call_id,
        tool: name,
        args,
        resolve,
        reject,
        timeoutId,
      });

      this.sendToolCall(call_id, name, args, timeout_ms);
    });

    if (dedupeKey) {
      this.inFlightReminderToolCalls.set(dedupeKey, toolCallPromise);
      toolCallPromise
        .then((result) => {
          this.completedReminderToolResults.set(dedupeKey, result);
          this.inFlightReminderToolCalls.delete(dedupeKey);
        })
        .catch(() => {
          this.inFlightReminderToolCalls.delete(dedupeKey);
        });
    }

    return toolCallPromise;
  }

  private handleToolResult(msg: ToolResultMessage): void {
    const pending = this.pendingToolCalls.get(msg.call_id);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.pendingToolCalls.delete(msg.call_id);
    this.state = "STREAM_OUTPUT";
    this.collectCitationFromToolResult(msg.tool, pending.args, msg.result.data);

    pending.resolve(msg.result.data);
  }

  private handleToolError(msg: ToolErrorMessage): void {
    const pending = this.pendingToolCalls.get(msg.call_id);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.pendingToolCalls.delete(msg.call_id);
    this.toolErrorCount++;
    this.state = "STREAM_OUTPUT";

    pending.reject(new Error(msg.error.message));
  }

  private handleComplete(fullText: string, userMessageId: string): void {
    this.state = "FINALIZE";
    const finalText = this.ensureNonEmptyFinalText(fullText);
    this.fullResponseText = finalText;

    if (!fullText.trim()) {
      this.sendToken(finalText);
    }

    const finalMsg: FinalResponseMessage = {
      protocol_version: PROTOCOL_VERSION,
      app_version: this.appVersion,
      type: "final_response",
      run_id: this.runId,
      seq: this.nextSeq(),
      message: {
        message_id: uuidv4(),
        role: "assistant",
        text: finalText,
        created_at: Date.now(),
      },
      citations: this.citations,
      tool_summary: {
        calls: this.toolCallCount,
        errors: this.toolErrorCount,
      },
    };

    this.send(finalMsg);
    this.close(1000, "run_complete");
  }

  private ensureNonEmptyFinalText(fullText: string): string {
    const trimmed = fullText.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }

    if (this.toolCallCount > 0) {
      return "I finished processing your request, but I could not generate a readable response. Please ask again and I will summarize it clearly.";
    }

    return "I could not generate a response just now. Please try again.";
  }

  private handleStreamError(error: Error): void {
    if (this.state === "CLOSE") return;
    this.sendError(ERROR_CODES.MODEL_UPSTREAM_ERROR, error.message, true);
  }

  private collectCitationFromToolResult(
    tool: string,
    args: Record<string, unknown>,
    data: unknown,
  ): void {
    switch (tool) {
      case "search_memory": {
        const items =
          (
            data as
              | {
                  items?: Array<{
                    id?: string;
                    source_type?: string;
                    memory_item_id?: string | null;
                    attachment_id?: string | null;
                  }>;
                }
              | undefined
          )?.items ?? [];
        for (const item of items.slice(0, 3)) {
          if (item.source_type === "attachment_metadata" && item.attachment_id) {
            this.pushCitation({
              kind: "attachment",
              attachment_id: item.attachment_id,
            });
          } else if (item.memory_item_id || item.id) {
            this.pushCitation({
              kind: "memory",
              memory_item_id: item.memory_item_id || item.id,
            });
          }
        }
        break;
      }
      case "search_attachments": {
        const attachments =
          (
            data as
              | { attachments?: Array<{ id?: string; type?: string }> }
              | undefined
          )?.attachments ?? [];
        for (const att of attachments.slice(0, 3)) {
          if (att.id) {
            this.pushCitation({
              kind: "attachment",
              attachment_id: att.id,
              note:
                att.type === "audio"
                  ? "Voice Note"
                  : att.type === "image"
                    ? "Photo"
                    : "Source",
            });
          }
        }
        break;
      }
      case "get_attachment_bundle": {
        const bundle = data as
          | {
              attachment?: { id?: string; type?: string };
              metadata?: Array<{ kind?: string }>;
            }
          | undefined;
        const attachmentId =
          bundle?.attachment?.id || (args.attachment_id as string | undefined);
        if (attachmentId) {
          const metadataKind = bundle?.metadata?.[0]?.kind;
          this.pushCitation({
            kind: "attachment",
            attachment_id: attachmentId,
            metadata_kind: metadataKind,
            note:
              metadataKind === "transcript"
                ? "Voice Note"
                : metadataKind === "scene"
                  ? "Photo"
                  : "Source",
          });
        }
        break;
      }
      case "get_message_with_attachments": {
        const messageId =
          (data as { message?: { id?: string } } | undefined)?.message?.id ||
          (args.message_id as string | undefined);
        if (messageId) {
          this.pushCitation({ kind: "message", message_id: messageId });
        }
        break;
      }
    }
  }

  private pushCitation(citation: Citation): void {
    const key = [
      citation.kind,
      citation.attachment_id ?? "",
      citation.message_id ?? "",
      citation.memory_item_id ?? "",
      citation.metadata_kind ?? "",
    ].join("|");
    const exists = this.citations.some(
      (c) =>
        [
          c.kind,
          c.attachment_id ?? "",
          c.message_id ?? "",
          c.memory_item_id ?? "",
          c.metadata_kind ?? "",
        ].join("|") === key,
    );
    if (!exists) {
      this.citations.push(citation);
    }
  }

  private handleError(error: Error): void {
    this.log("WS_ERROR", { message: error.message });
    this.cleanup();
  }

  private mapConversationToTurns(messages: unknown): ConversationTurn[] {
    if (!Array.isArray(messages)) return [];

    return messages.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const maybe = item as {
        role?: unknown;
        text?: unknown;
      };
      if (maybe.role !== "user" && maybe.role !== "assistant") return [];
      if (typeof maybe.text !== "string") return [];
      const text = maybe.text.trim();
      if (!text) return [];
      return [{ role: maybe.role, text }];
    });
  }

  // Message sending helpers
  private nextSeq(): number {
    return ++this.seq;
  }

  private send(msg: unknown): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.logOutbound(msg);
      this.socket.send(JSON.stringify(msg));
    }
  }

  private sendToken(text: string): void {
    const msg: AssistantTokenMessage = {
      protocol_version: PROTOCOL_VERSION,
      app_version: this.appVersion,
      type: "assistant_token",
      run_id: this.runId,
      seq: this.nextSeq(),
      text,
    };
    this.send(msg);
  }

  private sendStatus(stage: string, detail?: string): void {
    const msg: StatusMessage = {
      protocol_version: PROTOCOL_VERSION,
      app_version: this.appVersion,
      type: "status",
      run_id: this.runId,
      seq: this.nextSeq(),
      stage,
      detail,
    };
    this.send(msg);
  }

  private sendToolCall(
    call_id: string,
    tool: string,
    args: Record<string, unknown>,
    timeout_ms: number,
  ): void {
    const msg: ToolCallMessage = {
      protocol_version: PROTOCOL_VERSION,
      app_version: this.appVersion,
      type: "tool_call",
      run_id: this.runId,
      seq: this.nextSeq(),
      call_id,
      tool,
      args,
      expects_result: true,
      timeout_ms,
    };
    this.send(msg);
  }

  private sendError(code: string, message: string, retryable: boolean): void {
    const msg: RunErrorMessage = {
      protocol_version: PROTOCOL_VERSION,
      app_version: this.appVersion,
      type: "run_error",
      run_id: this.runId || "unknown",
      seq: this.nextSeq(),
      error: { code, message, retryable },
    };
    this.send(msg);
    this.close(1011, "run_error");
  }

  private close(code = 1000, reason?: string): void {
    this.state = "CLOSE";
    this.socket.close(code, reason);
  }

  private cleanup(): void {
    this.log("CLEANUP", {
      pending_tool_calls: this.pendingToolCalls.size,
    });
    for (const pending of this.pendingToolCalls.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error("Connection closed"));
    }
    this.pendingToolCalls.clear();
    this.inFlightReminderToolCalls.clear();
    this.completedReminderToolResults.clear();
  }

  private getReminderMutationDedupeKey(
    toolName: string,
    args: Record<string, unknown>,
  ): string | null {
    const reminderMutationTools = new Set([
      "create_reminder",
      "update_reminder",
      "cancel_reminder",
    ]);
    if (!reminderMutationTools.has(toolName)) {
      return null;
    }
    return `${toolName}|${this.stableStringify(args)}`;
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(",")}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${this.stableStringify(v)}`)
      .join(",")}}`;
  }

  private logInbound(msg: unknown): void {
    this.log("IN", msg);
  }

  private logOutbound(msg: unknown): void {
    this.log("OUT", msg);
  }

  private log(direction: string, payload: unknown): void {
    const redacted = this.redactForLogs(payload);
    console.log(
      `[ws:${this.connectionId}] ${direction} ${JSON.stringify(redacted)}`,
    );
  }

  private redactForLogs(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactForLogs(item));
    }

    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(obj)) {
        if (key.toLowerCase() === "base64") {
          const length = typeof val === "string" ? val.length : 0;
          out[key] = `[REDACTED_BASE64 length=${length}]`;
          continue;
        }
        out[key] = this.redactForLogs(val);
      }

      return out;
    }

    return value;
  }
}
