import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { closeHttpServer, startServer } from "../src/server/http.js";
import { MemoryStore } from "../src/store/memory-store.js";
import { setUserStoreForTests } from "../src/store/store.js";

const TARGET = "kr.mt.math.number-operations.g5-6.s6-01-09.application";
let server: Server;
let baseUrl: string;

async function mcpRequest(body: unknown, user = "http-guardian"): Promise<{ status: number; data: any }> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-user-id": user },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const dataLine = text.split(/\r?\n/).find((line) => line.startsWith("data:"));
  return { status: response.status, data: JSON.parse(dataLine ? dataLine.slice(5).trim() : text) };
}

async function toolCall(name: string, args: Record<string, unknown>): Promise<any> {
  const response = await mcpRequest({ jsonrpc: "2.0", id: `${name}-${Date.now()}`, method: "tools/call", params: { name, arguments: args } });
  expect(response.status).toBe(200);
  expect(response.data.result.isError).not.toBe(true);
  return response.data.result;
}

describe("stateless Streamable HTTP MCP server", () => {
  beforeAll(async () => {
    setUserStoreForTests(new MemoryStore());
    server = await startServer({ port: 0, host: "127.0.0.1" });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await closeHttpServer(server);
    setUserStoreForTests();
  });

  test("health and three supported initialize versions work", async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    const healthBody = await health.json() as any;
    expect(healthBody).toMatchObject({ status: "ok", service: "learning-path-check-mcp", version: "0.1.0", tools: 10 });
    expect(healthBody.dataVersion.middle).toContain("v0.4.0-candidate");
    for (const protocolVersion of ["2025-11-25", "2025-06-18", "2024-11-05"]) {
      const initialized = await mcpRequest({ jsonrpc: "2.0", id: protocolVersion, method: "initialize", params: { protocolVersion, capabilities: {}, clientInfo: { name: "test", version: "1" } } });
      expect(initialized.status).toBe(200);
      expect(initialized.data.result.protocolVersion).toBe(protocolVersion);
    }
  });

  test("tools/list exposes exactly ten annotated tools", async () => {
    const listed = await mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(listed.status).toBe(200);
    expect(listed.data.result.tools).toHaveLength(10);
    expect(listed.data.result.tools.map((tool: any) => tool.name)).toEqual([
      "manage_child_profile", "search_curriculum", "get_curriculum_overview", "trace_learning_path", "create_learning_check",
      "assess_learning_check", "build_review_plan", "record_learning_progress", "get_upcoming_learning_actions", "get_parent_learning_report",
    ]);
    const search = listed.data.result.tools.find((tool: any) => tool.name === "search_curriculum");
    const assess = listed.data.result.tools.find((tool: any) => tool.name === "assess_learning_check");
    expect(search.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(assess.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
  });

  test("profile through report succeeds over independent HTTP requests", async () => {
    const profile = await toolCall("manage_child_profile", { action: "create", nickname: "HTTP 첫째", schoolLevel: "elementary", grade: 5, minutesPerDay: 10 });
    const childId = profile.structuredContent.childId;
    const search = await toolCall("search_curriculum", { query: "분수 나눗셈", schoolLevel: "elementary", subject: "수학" });
    expect(search.structuredContent.results.some((result: any) => result.conceptId === TARGET)).toBe(true);
    const trace = await toolCall("trace_learning_path", { conceptId: TARGET, maxDepth: 6 });
    expect(trace.structuredContent.prerequisites.length).toBeGreaterThan(1);
    const check = await toolCall("create_learning_check", { childId, conceptId: TARGET, itemCount: 3, createdAt: "2026-07-14T00:00:00Z" });
    const assessed = await toolCall("assess_learning_check", {
      childId,
      checkId: check.structuredContent.checkId,
      responses: check.structuredContent.questions.map((question: any) => ({ questionId: question.id, outcome: "partial" })),
      assessedAt: "2026-07-14T12:00:00Z",
    });
    expect(assessed.structuredContent.firstReview).toBeTruthy();
    const plan = await toolCall("build_review_plan", { childId, targetConceptId: TARGET, durationWeeks: 1, startDate: "2026-07-14" });
    expect(plan.structuredContent.activities).toHaveLength(7);
    const report = await toolCall("get_parent_learning_report", { childId, period: "weekly", from: "2026-07-14", to: "2026-07-20" });
    expect(report.structuredContent.summary.reviewNeeded).toBeGreaterThan(0);
    expect(report.content[0].text).toContain(childId);
  });

  test("oversized, invalid, and unsupported requests are sanitized", async () => {
    const oversized = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: "x".repeat(300 * 1024) }) });
    expect(oversized.status).toBe(413);
    const invalid = await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect(invalid.status).toBe(400);
    const method = await fetch(`${baseUrl}/mcp`);
    expect(method.status).toBe(405);
    const missing = await fetch(`${baseUrl}/missing`);
    expect(missing.status).toBe(404);
    const absent = await mcpRequest({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "manage_child_profile", arguments: { action: "read", childId: "child-not-present" } } }, "different-user");
    expect(absent.data.result.isError).toBe(true);
    expect(absent.data.result.content[0].text).toContain("찾을 수 없습니다");
    expect(absent.data.result.content[0].text).not.toContain("/Users/");
    expect(absent.data.result).not.toHaveProperty("stack");
  });
});
