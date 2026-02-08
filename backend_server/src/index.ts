import "./bootstrap.ts";
import { createServer } from "./server.ts";

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set");
  process.exit(1);
}

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const start = async () => {
  const server = await createServer();

  try {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`Server running on port ${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
