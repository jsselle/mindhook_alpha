import type { FastifyRequest } from "fastify";
import { WebSocket } from "ws";
import { RunManager } from "./runManager.ts";

export const handleConnection = (
  socket: WebSocket,
  req: FastifyRequest,
): void => {
  const connectionId = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  console.log(
    `[ws:${connectionId}] New WebSocket connection ip=${req.ip} url=${req.url}`,
  );

  // Each connection gets its own RunManager
  new RunManager(socket, connectionId);
};
