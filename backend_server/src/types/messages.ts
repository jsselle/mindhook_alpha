// Protocol version
export const PROTOCOL_VERSION = '1.0';

// Base envelope (all messages)
export interface MessageEnvelope {
    protocol_version: string;
    app_version: string;
    type: string;
    run_id: string;
    seq: number;
}

// Client -> Server: run_start
export interface RunStartMessage extends MessageEnvelope {
    type: 'run_start';
    user: {
        message_id: string;
        text: string;
        created_at: number;
    };
    attachments: AttachmentPayload[];
    context: {
        recent_message_count: number;
    };
}

export interface AttachmentPayload {
    attachment_id: string;
    type: 'image' | 'audio' | 'video' | 'file';
    mime: string;
    base64: string;
    duration_ms?: number;
    width?: number;
    height?: number;
    sha256?: string;
    byte_length: number;
}

// Server -> Client: assistant_token
export interface AssistantTokenMessage extends MessageEnvelope {
    type: 'assistant_token';
    text: string;
}

// Server -> Client: status
export interface StatusMessage extends MessageEnvelope {
    type: 'status';
    stage: string;
    detail?: string;
}

// Server -> Client: tool_call
export interface ToolCallMessage extends MessageEnvelope {
    type: 'tool_call';
    call_id: string;
    tool: string;
    args: Record<string, unknown>;
    expects_result: boolean;
    timeout_ms: number;
}

// Client -> Server: tool_result
export interface ToolResultMessage extends MessageEnvelope {
    type: 'tool_result';
    call_id: string;
    tool: string;
    result: {
        ok: true;
        data?: unknown;
    };
}

// Client -> Server: tool_error
export interface ToolErrorMessage extends MessageEnvelope {
    type: 'tool_error';
    call_id: string;
    tool: string;
    error: {
        code: string;
        message: string;
        retryable: boolean;
    };
}

// Server -> Client: final_response
export interface FinalResponseMessage extends MessageEnvelope {
    type: 'final_response';
    message: {
        message_id: string;
        role: 'assistant';
        text: string;
        created_at: number;
    };
    citations: Citation[];
    tool_summary: {
        calls: number;
        errors: number;
    };
}

export interface Citation {
    kind: 'attachment' | 'message' | 'memory';
    attachment_id?: string;
    message_id?: string;
    memory_item_id?: string;
    metadata_kind?: string;
    note?: string;
}

// Server -> Client: run_error
export interface RunErrorMessage extends MessageEnvelope {
    type: 'run_error';
    error: {
        code: string;
        message: string;
        retryable: boolean;
    };
}

// Error codes
export const ERROR_CODES = {
    PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
    INVALID_MESSAGE: 'INVALID_MESSAGE',
    UNSUPPORTED_PROTOCOL: 'UNSUPPORTED_PROTOCOL',
    UNSUPPORTED_MIME: 'UNSUPPORTED_MIME',
    MODEL_UPSTREAM_ERROR: 'MODEL_UPSTREAM_ERROR',
    TOOL_TIMEOUT: 'TOOL_TIMEOUT',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
