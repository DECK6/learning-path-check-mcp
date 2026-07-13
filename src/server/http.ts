import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { MAX_BODY_BYTES } from "../config/limits.js";
import { SERVICE_ID, SERVICE_VERSION } from "../config/version.js";
import { compiledMeta } from "../domain/data.js";
import { assertProductionRuntimeConfiguration, runWithRequestHeaders, type RequestHeaders } from "../identity.js";
import { PUBLIC_TOOLS } from "../public-tools/registry.js";
import { createMcpServer } from "./mcp-server.js";
import { getUserStore } from "../store/store.js";
import type { ChildProfile } from "../store/types.js";

function healthBody(): Record<string, unknown> {
  return {
    status: "ok",
    service: SERVICE_ID,
    version: SERVICE_VERSION,
    tools: PUBLIC_TOOLS.length,
    dataVersion: compiledMeta.dataVersion,
  };
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  if (response.headersSent) return;
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function jsonRpcError(response: ServerResponse, statusCode: number, code: number, message: string): void {
  writeJson(response, statusCode, { jsonrpc: "2.0", error: { code, message }, id: null });
}

function contentLengthTooLarge(request: IncomingMessage): boolean {
  const raw = request.headers["content-length"];
  if (!raw) return false;
  const value = Number(raw);
  return Number.isFinite(value) && value > MAX_BODY_BYTES;
}

async function readJsonBody(request: IncomingMessage, response: ServerResponse): Promise<unknown | undefined> {
  if (contentLengthTooLarge(request)) {
    request.resume();
    jsonRpcError(response, 413, -32000, "Request body too large.");
    return undefined;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      jsonRpcError(response, 413, -32000, "Request body too large.");
      return undefined;
    }
    chunks.push(buffer);
  }
  try {
    const text = Buffer.concat(chunks).toString("utf8");
    return text.length ? JSON.parse(text) : {};
  } catch {
    jsonRpcError(response, 400, -32700, "Invalid JSON body.");
    return undefined;
  }
}

async function handleMcpPost(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request, response);
  if (body === undefined) return;
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await runWithRequestHeaders(request.headers as RequestHeaders, async () => {
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    });
  } catch (error) {
    console.error("MCP request failed:", error instanceof Error ? error.message : "unknown error");
    if (!response.headersSent) jsonRpcError(response, 500, -32603, "Internal server error.");
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export function createHttpServer(): Server {
  return createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/health" && request.method === "GET") {
        writeJson(response, 200, healthBody());
        return;
      }
      if (url.pathname === "/mcp" && request.method === "POST") {
        await handleMcpPost(request, response);
        return;
      }
      if (url.pathname === "/mcp" && (request.method === "GET" || request.method === "DELETE")) {
        jsonRpcError(response, 405, -32000, "Method not allowed.");
        return;
      }
      writeJson(response, 404, { error: "Not found." });
    })().catch((error) => {
      console.error("HTTP request failed:", error instanceof Error ? error.message : "unknown error");
      writeJson(response, 500, { error: "Internal server error." });
    });
  });
}

async function assertProductionStoreReady(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  const store = getUserStore();
  const token = randomUUID();
  const scopeKey = `startup-health-${token}`;
  const now = new Date().toISOString();
  const child: ChildProfile = {
    id: `startup-health-${token}`,
    nickname: "startup-health",
    schoolLevel: "elementary",
    grade: 1,
    interestedSubjects: [],
    learningGoals: [],
    guardianConsent: { version: "v1", grantedAt: now },
    createdAt: now,
    updatedAt: now,
  };
  let written = false;
  try {
    await store.upsertChild(scopeKey, child);
    written = true;
    if (!(await store.getChild(scopeKey, child.id))) throw new Error("운영 저장소 읽기 검증에 실패했습니다.");
  } finally {
    if (written) await store.deleteAllForScope(scopeKey);
  }
}

export async function startServer(options: { port?: number; host?: string } = {}): Promise<Server> {
  assertProductionRuntimeConfiguration();
  await assertProductionStoreReady();
  const port = options.port ?? Number(process.env.PORT ?? 8080);
  const host = options.host ?? "0.0.0.0";
  const server = createHttpServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

export async function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
