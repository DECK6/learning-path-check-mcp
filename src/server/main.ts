import { closeHttpServer, startServer } from "./http.js";

const server = await startServer();
let closing = false;

async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  try {
    await closeHttpServer(server);
    process.exitCode = 0;
  } catch (error) {
    console.error("Server shutdown failed:", error instanceof Error ? error.message : "unknown error");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
