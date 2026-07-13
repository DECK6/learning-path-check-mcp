import { z } from "zod";
import { MAX_OBSERVATION_CHARS } from "../config/limits.js";
import { learningGraph } from "../domain/graph.js";
import { newId } from "../lib/id.js";
import type { ToolDefinition } from "../lib/types.js";
import { getUserStore } from "../store/store.js";
import type { LearningProgress } from "../store/types.js";
import { conceptView, requireChild, timestamp, toolResult } from "./common.js";

export const recordLearningProgressInputSchema = z.object({
  childId: z.string().min(1),
  planId: z.string().min(1),
  conceptId: z.string().min(1),
  activityId: z.string().min(1).optional(),
  status: z.enum(["planned", "in_progress", "completed", "skipped"]),
  observation: z.string().max(MAX_OBSERVATION_CHARS).optional(),
  recordedAt: z.string().optional(),
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
  if (!activity && !plan.reviewConceptIds.includes(input.conceptId) && plan.targetConceptId !== input.conceptId) throw new Error("복습 계획에 포함되지 않은 conceptId입니다.");
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
  description: "With Learning Path Check(우리 아이 뭐 배우지? 체크), record a child's structured progress state and an optional guardian observation for one saved review-plan activity.",
  inputSchema: recordLearningProgressInputSchema,
  handler,
};
