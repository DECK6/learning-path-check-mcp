import { z } from "zod";
import { buildPlanDraft } from "../domain/plan-builder.js";
import { learningGraph } from "../domain/graph.js";
import { latestConceptStatuses } from "../domain/history.js";
import { currentDate, isoDate } from "../lib/date.js";
import { newId } from "../lib/id.js";
import type { ToolDefinition } from "../lib/types.js";
import { getUserStore } from "../store/store.js";
import type { ReviewPlan } from "../store/types.js";
import { conceptView, requireChild, timestamp, toolResult } from "./common.js";

export const buildReviewPlanInputSchema = z.object({
  childId: z.string().min(1).describe("복습 계획을 저장할 기존 자녀 프로필 ID"),
  targetConceptId: z.string().min(1).describe("복습 후 다시 확인할 목표 개념 ID"),
  reviewConceptIds: z.array(z.string().min(1)).min(1).max(50).optional().describe("명시적 복습 개념 ID 목록. 생략하면 저장된 review_needed 개념을 사용하며 둘 다 없으면 생성할 수 없습니다"),
  durationWeeks: z.number().int().min(1).max(12).optional().default(2).describe("계획 기간(주). 기본 2, 범위 1~12"),
  minutesPerDay: z.number().int().min(5).max(240).optional().describe("하루 복습 시간(분). 생략하면 프로필 설정 또는 20분"),
  startDate: z.string().optional().describe("계획 시작일(YYYY-MM-DD). 생략하면 현재 날짜"),
  createdAt: z.string().optional().describe("선택 생성 시각(YYYY-MM-DD 또는 ISO 날짜·시간). 생략하면 현재 시각"),
});

async function handler(rawInput: unknown) {
  const input = buildReviewPlanInputSchema.parse(rawInput ?? {});
  const { child, scopeKey } = await requireChild(input.childId);
  const target = learningGraph.require(input.targetConceptId);
  const store = getUserStore();
  const latest = latestConceptStatuses(await store.listConceptStatuses(scopeKey, child.id));
  const requested = input.reviewConceptIds ?? [...latest.values()].filter((status) => status.status === "review_needed").map((status) => status.conceptId);
  const unique = [...new Set(requested)];
  if (!unique.length) throw new Error("저장된 복습 필요 개념이 없습니다. reviewConceptIds를 전달하거나 먼저 학습 점검을 완료해 주세요.");
  for (const conceptId of unique) {
    const concept = learningGraph.require(conceptId);
    if (concept.nodeKind !== "topic") throw new Error(`복습 계획에는 topic conceptId를 사용해 주세요: ${conceptId}`);
  }
  const planId = newId("plan");
  const startDate = isoDate(input.startDate ?? currentDate());
  const minutesPerDay = input.minutesPerDay ?? child.minutesPerDay ?? 20;
  const draft = buildPlanDraft({ planId, targetConceptId: target.id, reviewConceptIds: unique, durationWeeks: input.durationWeeks, minutesPerDay, startDate });
  const plan: ReviewPlan = {
    id: planId,
    childId: child.id,
    targetConceptId: target.id,
    reviewConceptIds: draft.orderedConceptIds,
    durationWeeks: input.durationWeeks,
    minutesPerDay,
    startDate,
    targetRetryDate: draft.targetRetryDate,
    activities: draft.activities,
    calendarEvents: draft.calendarEvents,
    createdAt: timestamp(input.createdAt),
  };
  await store.savePlan(scopeKey, plan);
  const markdown = [
    "# 복습 계획 생성",
    "",
    `- childId: ${child.id}`,
    `- planId: ${plan.id}`,
    `- 목표 conceptId: ${target.id}`,
    `- 목표 재도전일: ${plan.targetRetryDate}`,
    "",
    ...plan.activities.map((activity) => `- ${activity.date} · ${activity.week}주차 ${activity.day}일차 · activityId: ${activity.activityId} · conceptId: ${activity.conceptId} · ${activity.minutes}분 · ${activity.objective} · 성취기준 ${learningGraph.require(activity.conceptId).standardCodes.join(", ") || "과정 수준"}`),
  ].join("\n");
  return toolResult(markdown, {
    status: "ok",
    childId: child.id,
    planId: plan.id,
    targetConceptId: target.id,
    target: conceptView(target),
    reviewConcepts: plan.reviewConceptIds.map((id) => conceptView(learningGraph.require(id))),
    durationWeeks: plan.durationWeeks,
    minutesPerDay: plan.minutesPerDay,
    startDate: plan.startDate,
    targetRetryDate: plan.targetRetryDate,
    activities: plan.activities.map((activity) => ({ ...activity, concept: conceptView(learningGraph.require(activity.conceptId)) })),
    calendarEvents: plan.calendarEvents.map((event, index) => ({ ...event, planId: plan.id, ...(index < plan.activities.length ? { activityId: plan.activities[index].activityId } : {}) })),
    createdAt: plan.createdAt,
  });
}

export const buildReviewPlanTool: ToolDefinition = {
  name: "build_review_plan",
  title: "복습 계획 만들기",
  description: "Requires an authenticated PlayMCP user. With Learning Path Check(우리 아이 뭐 배우지? 체크), create and store a prerequisite-ordered daily review plan and calendar-ready events. Provide reviewConceptIds, or omit them only when the child already has saved review_needed concept statuses.",
  inputSchema: buildReviewPlanInputSchema,
  handler,
};
