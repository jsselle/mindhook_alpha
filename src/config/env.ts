// Launch configuration for the app
// Environment-specific settings

declare const __DEV__: boolean;

export const CONFIG = {
  /** WebSocket server URL - uses LAN host in dev, production server otherwise */
  WS_URL: __DEV__
    ? "ws://192.168.1.208:3000/ws"
    : "wss://your-production-server.com/ws",

  /** Maximum number of attachments per message */
  MAX_ATTACHMENTS: 6,

  /** Maximum attachment size in megabytes */
  MAX_ATTACHMENT_MB: 8,

  /** Tool execution timeout in milliseconds */
  TOOL_TIMEOUT_MS: 15000,
} as const;

// Type for the config object
export type AppConfig = typeof CONFIG;
