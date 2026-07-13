import { z } from "zod";
import { MAX_OBSERVATION_CHARS } from "../config/limits.js";
import { learningGraph } from "../domain/graph.js";
import { newId } from "../lib/id.js";
import type { ToolDefinition } from "../lib/types.js";
import { getUserStore } from "../store/store.js";
import type { LearningProgress } from "../store/types.js";
import { conceptView, requireChild, timestamp, toolResult } from "./common.js";

export const recordLearningProgressInputSchema = z.object({
  childId: z.string().min(1).describe("복습 계획 소유자인 기존 자녀 프로필 ID"),
  planId: z.string().min(1).describe("build_review_plan이 반환한 복습 계획 ID"),
  conceptId: z.string().min(1).describe("해당 계획에 포함된 기록 대상 개념 ID"),
  activityId: z.string().min(1).optional().describe("일정된 복습 활동에는 필수인 활동 ID. planId에 속하고 conceptId와 일치해야 하며, 계획의 targetConceptId 재점검을 기록할 때만 생략할 수 있습니다"),
  status: z.enum(["planned", "in_progress", "completed", "skipped"]).describe("활동 상태: planned, in_progress, completed, skipped 중 하나"),
  observation: z.string().max(MAX_OBSERVATION_CHARS).optional().describe("선택 보호자 관찰 메모. 개인정보를 넣지 않습니다"),
  recordedAt: z.string().optional().describe("선택 기록 시각(YYYY-MM-DD 또는 ISO 날짜·시간). 생략하면 현재 시각"),
});

async function handler(rawInput: unknown) {
  const input = recordLearningProgressInputSchema.parse(rawInput ?? {});
  const { child, scopeKey } = await requireChild(input.childId);
  const store = getUserStore();
  const plan = await store.getPlan(scopeKey, input.planId);
  if (!plan || plan.childId !== child.id) throw new Error("복습 계획을 찾을 수 없습니다.");
  const activity = input.activityId ? plan.activities.find((candidate) => candidate.activityId === input.activityId) : undefined;
  if (input.activityId && !activity) throw new Error("복습 계획에 포함되지 않은 activityId입니다.");
  if (activity && activity.conceptId !== input.conceptId) throw new Error("activityId와 conceptId가 같은 계획 항목을 가리켜야 합니다.");
  if (!activity && input.conceptId !== plan.targetConceptId) throw new Error("일정된 복습 활동 기록에는 해당 activityId가 필요합니다. activityId는 목표 개념 재점검을 기록할 때만 생략할 수 있습니다.");
  const concept = learningGraph.require(input.conceptId);
  const progress: LearningProgress = {
    id: newId("progress"),
    childId: child.id,
    planId: plan.id,
    conceptId: concept.id,
    ...(input.activityId ? { activityId: input.activityId } : {}),
    status: input.status,
    ...(input.observation?.trim() ? { observation: input.observation.trim() } : {}),
    recordedAt: timestamp(input.recordedAt),
  };
  await store.saveProgress(scopeKey, progress);
  return toolResult(`# 복습 진행 기록\n\n- childId: ${child.id}\n- planId: ${plan.id}\n- progressId: ${progress.id}\n${progress.activityId ? `- activityId: ${progress.activityId}\n` : ""}- conceptId: ${concept.id}\n- 개념: ${concept.titleKo}\n- 성취기준: ${concept.standardCodes.join(", ") || "과정 수준"}\n- 상태: ${progress.status}\n- 기록 시각: ${progress.recordedAt}`, {
    status: "ok",
    childId: child.id,
    planId: plan.id,
    progressId: progress.id,
    activityId: progress.activityId,
    concept: conceptView(concept),
    progress,
    scheduledDate: activity?.date,
  });
}

export const recordLearningProgressTool: ToolDefinition = {
  name: "record_learning_progress",
  title: "복습 진행 기록",
  description: "Requires a connected PlayMCP Key/Token credential of at least 32 characters. With Learning Path Check(우리 아이 뭐 배우지? 체크), record a structured progress state and optional guardian observation for a saved review plan. activityId is required for a scheduled review activity and must match planId and conceptId; omit it only for the plan's targetConceptId recheck.",
  inputSchema: recordLearningProgressInputSchema,
  handler,
};
