import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { handleConnection } from "./ws/handler.ts";

export const createServer = async () => {
  const fastify = Fastify({ logger: true });

  await fastify.register(websocket);

  fastify.get("/ws", { websocket: true }, (socket, req) => {
    handleConnection(socket, req);
  });

  // Health check
  fastify.get("/health", async () => ({ status: "ok" }));

  return fastify;
};
