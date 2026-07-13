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

export const TOOL_ANNOTATIONS: Readonly<Record<string, Readonly<ToolAnnotations>>> = Object.freeze({
  manage_child_profile: WRITES_STATE,
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

function extractRawShape(schema: unknown): z.ZodRawShape {
  if (schema && typeof schema === "object" && "shape" in schema) return (schema as { shape: z.ZodRawShape }).shape;
  return {};
}

function inputError(error: ZodError): string {
  const field = error.issues[0]?.path.join(".") || "입력값";
  return `입력값을 확인해 주세요: ${field}`;
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
      inputSchema: extractRawShape(tool.inputSchema),
      annotations: TOOL_ANNOTATIONS[tool.name],
    }, async (input: unknown) => {
      try {
        return await tool.handler(input);
      } catch (error) {
        return safeErrorResult(error);
      }
    });
  }
}
