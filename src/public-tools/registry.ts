import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError } from "zod";
import { PUBLIC_META } from "./common.js";
import type { McpToolResult, ToolDefinition } from "../lib/types.js";
import { manageChildProfileTool } from "./manage-child-profile.js";
import { searchCurriculumTool } from "./search-curriculum.js";
import { getCurriculumOverviewTool } from "./get-curriculum-overview.js";
import { traceLearningPathTool } from "./trace-learning-path.js";
import { createLearningCheckTool } from "./create-learning-check.js";
import { assessLearningCheckTool } from "./assess-learning-check.js";
import { buildReviewPlanTool } from "./build-review-plan.js";
import { recordLearningProgressTool } from "./record-learning-progress.js";
import { getUpcomingLearningActionsTool } from "./get-upcoming-learning-actions.js";
import { getParentLearningReportTool } from "./get-parent-learning-report.js";
import { sanitizeLearningTerms } from "../presenters/terms.js";
import { requireAuthenticatedScopeKey } from "../identity.js";

export const PUBLIC_TOOLS: readonly ToolDefinition[] = Object.freeze([
  manageChildProfileTool,
  searchCurriculumTool,
  getCurriculumOverviewTool,
  traceLearningPathTool,
  createLearningCheckTool,
  assessLearningCheckTool,
  buildReviewPlanTool,
  recordLearningProgressTool,
  getUpcomingLearningActionsTool,
  getParentLearningReportTool,
]);

type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

const READ_ONLY: Readonly<ToolAnnotations> = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const WRITES_STATE: Readonly<ToolAnnotations> = Object.freeze({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
const MAY_DELETE: Readonly<ToolAnnotations> = Object.freeze({ readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false });

export const TOOL_ANNOTATIONS: Readonly<Record<string, Readonly<ToolAnnotations>>> = Object.freeze({
  manage_child_profile: MAY_DELETE,
  search_curriculum: READ_ONLY,
  get_curriculum_overview: READ_ONLY,
  trace_learning_path: READ_ONLY,
  create_learning_check: WRITES_STATE,
  assess_learning_check: WRITES_STATE,
  build_review_plan: WRITES_STATE,
  record_learning_progress: WRITES_STATE,
  get_upcoming_learning_actions: READ_ONLY,
  get_parent_learning_report: READ_ONLY,
});

const ALWAYS_AUTHENTICATED_TOOLS = new Set([
  "manage_child_profile",
  "create_learning_check",
  "assess_learning_check",
  "build_review_plan",
  "record_learning_progress",
  "get_upcoming_learning_actions",
  "get_parent_learning_report",
]);

function requiresAuthentication(toolName: string, input: unknown): boolean {
  if (ALWAYS_AUTHENTICATED_TOOLS.has(toolName)) return true;
  return toolName === "get_curriculum_overview"
    && !!input && typeof input === "object"
    && typeof (input as Record<string, unknown>).childId === "string";
}

function extractRawShape(schema: unknown): z.ZodRawShape {
  if (schema && typeof schema === "object" && "shape" in schema) return (schema as { shape: z.ZodRawShape }).shape;
  return {};
}

function inputError(error: ZodError): string {
  const field = error.issues[0]?.path.join(".") || "입력값";
  return `입력값을 확인해 주세요: ${field}`;
}

const OBVIOUS_PII_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])-?[1-8]\d{6}\b/,
  /\b01(?:0|1|[6-9])[- ]?\d{3,4}[- ]?\d{4}\b/,
  /\b0(?:2|[3-6]\d)[- ]?\d{3,4}[- ]?\d{4}\b/,
];
const CARD_CANDIDATE = /\b(?:\d{13,19}|\d{4}(?:[- ]\d{4}){3}|\d{4}[- ]\d{6}[- ]\d{5})\b/g;
const PII_EXEMPT_FIELDS = new Set(["createdAt", "assessedAt", "recordedAt", "startDate", "asOf", "from", "to"]);

function passesLuhn(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19 || /^(978|979)/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function stringHasObviousPii(value: string): boolean {
  if (OBVIOUS_PII_PATTERNS.some((pattern) => pattern.test(value))) return true;
  return [...value.matchAll(CARD_CANDIDATE)].some((match) => passesLuhn(match[0]));
}

export function assertNoObviousPii(value: unknown, fieldName?: string): void {
  if (fieldName && PII_EXEMPT_FIELDS.has(fieldName)) return;
  if (typeof value === "string") {
    if (stringHasObviousPii(value)) {
      throw new Error("개인정보처럼 보이는 내용은 입력할 수 없습니다. 실명·연락처·이메일·주민번호·결제정보를 제외해 주세요.");
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertNoObviousPii(item, fieldName);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) assertNoObviousPii(item, key);
  }
}

function guardedRawShape(schema: unknown): z.ZodRawShape {
  const rawShape = extractRawShape(schema);
  return Object.fromEntries(Object.entries(rawShape).map(([key, field]) => [
    key,
    z.preprocess((value) => {
      assertNoObviousPii(value, key);
      return value;
    }, field).describe(field.description ?? "입력값"),
  ]));
}

export function safeErrorResult(error: unknown): McpToolResult {
  const rawMessage = error instanceof ZodError
    ? inputError(error)
    : error instanceof Error && error.message && !/[\\/][\w.-]+[\\/]/.test(error.message)
      ? error.message.slice(0, 300)
      : "요청을 처리하지 못했습니다. 입력값을 확인해 주세요.";
  const message = sanitizeLearningTerms(rawMessage.replace(/[\r\n\t]+/g, " ").trim());
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: message, meta: PUBLIC_META },
  };
}

export function registerPublicTools(server: McpServer): void {
  for (const tool of PUBLIC_TOOLS) {
    server.registerTool(tool.name, {
      title: tool.title,
      description: tool.description,
      inputSchema: guardedRawShape(tool.inputSchema),
      annotations: TOOL_ANNOTATIONS[tool.name],
    }, async (input: unknown) => {
      try {
        assertNoObviousPii(input);
        if (requiresAuthentication(tool.name, input)) requireAuthenticatedScopeKey();
        return await tool.handler(input);
      } catch (error) {
        return safeErrorResult(error);
      }
    });
  }
}
