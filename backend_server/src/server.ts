import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { handleConnection } from "./ws/handler.ts";

export const createServer = async () => {
  const fastify = Fastify({ logger: true, trustProxy: true });

  await fastify.register(websocket);

  fastify.addHook("onRequest", async (req) => {
    if (req.url !== "/ws") return;

    console.info(
      {
        method: req.method,
        url: req.url,
        host: req.headers.host,
        connection: req.headers.connection,
        upgrade: req.headers.upgrade,
        secWebSocketVersion: req.headers["sec-websocket-version"],
        secWebSocketKeyPresent: Boolean(req.headers["sec-websocket-key"]),
        secWebSocketProtocol: req.headers["sec-websocket-protocol"],
        xForwardedProto: req.headers["x-forwarded-proto"],
        userAgent: req.headers["user-agent"],
      },
      "ws request received",
    );
  });

  fastify.route({
    method: "GET",
    url: "/ws",
    websocket: true,
    wsHandler: (socket, req) => {
      handleConnection(socket, req);
    },
    handler: async (socket, req) => {
      //@ts-ignore
      handleConnection(socket, req);
    },
  });

  // Health check
  fastify.get("/health", async () => ({ status: "ok" }));

  return fastify;
};
