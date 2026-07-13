import { z } from "zod";
import { collectUpcomingActions } from "../domain/history.js";
import { learningGraph } from "../domain/graph.js";
import { currentDate, isoDate } from "../lib/date.js";
import type { ToolDefinition } from "../lib/types.js";
import { getUserStore } from "../store/store.js";
import { conceptView, requireChild, toolResult } from "./common.js";

export const getUpcomingLearningActionsInputSchema = z.object({
  childId: z.string().min(1).describe("예정 활동을 조회할 기존 자녀 프로필 ID"),
  asOf: z.string().optional().describe("기준일(YYYY-MM-DD). 생략하면 현재 날짜"),
  daysAhead: z.number().int().min(0).max(90).optional().default(30).describe("기준일부터 조회할 일수. 기본 30, 범위 0~90이며 지연 항목은 별도 포함됩니다"),
});

async function handler(rawInput: unknown) {
  const input = getUpcomingLearningActionsInputSchema.parse(rawInput ?? {});
  const { child, scopeKey } = await requireChild(input.childId);
  const asOf = isoDate(input.asOf ?? currentDate());
  const store = getUserStore();
  const [plans, progress, statuses] = await Promise.all([
    store.listPlans(scopeKey, child.id),
    store.listProgress(scopeKey, child.id),
    store.listConceptStatuses(scopeKey, child.id),
  ]);
  const actions = collectUpcomingActions({ plans, progress, statuses, asOf, daysAhead: input.daysAhead });
  const views = actions.map((action) => ({ ...action, concept: conceptView(learningGraph.require(action.conceptId)) }));
  const groups = {
    overdue: views.filter((action) => action.timing === "overdue"),
    today: views.filter((action) => action.timing === "today"),
    upcoming: views.filter((action) => action.timing === "upcoming"),
  };
  const kindKo = (kind: string) => kind === "review_activity" ? "복습 활동" : "재점검";
  const markdown = [
    "# 예정된 학습 행동",
    "",
    `- childId: ${child.id}`,
    `- 기준일: ${asOf}`,
    "",
    ...(["overdue", "today", "upcoming"] as const).flatMap((timing) => [
      `## ${{ overdue: "지연", today: "오늘", upcoming: "예정" }[timing]}`,
      ...(groups[timing].length ? groups[timing].map((action) => {
        const concept = learningGraph.require(action.conceptId);
        return `- ${action.date} · ${kindKo(action.kind)} · ${concept.titleKo} · conceptId: ${action.conceptId} · 성취기준 ${concept.standardCodes.join(", ") || "과정 수준"}${action.planId ? ` · planId: ${action.planId}` : ""}${action.activityId ? ` · activityId: ${action.activityId}` : ""}${action.statusId ? ` · statusId: ${action.statusId}` : ""}${action.checkId ? ` · checkId: ${action.checkId}` : ""}${action.questionId ? ` · questionId: ${action.questionId}` : ""}`;
      }) : ["- 없음"]),
      "",
    ]),
  ].join("\n");
  return toolResult(markdown, {
    status: "ok",
    childId: child.id,
    asOf,
    daysAhead: input.daysAhead,
    actions: views,
    groups,
    calendarEvents: views.map((action) => ({
      title: `${kindKo(action.kind)}: ${learningGraph.require(action.conceptId).titleKo}`,
      date: action.date,
      description: action.kind === "review_activity" ? `${action.minutes ?? "설정된"}분 복습 활동` : "권장 재점검",
      conceptId: action.conceptId,
      planId: action.planId,
      activityId: action.activityId,
      statusId: action.statusId,
      checkId: action.checkId,
      questionId: action.questionId,
    })),
  });
}

export const getUpcomingLearningActionsTool: ToolDefinition = {
  name: "get_upcoming_learning_actions",
  title: "예정 학습 행동 조회",
  description: "Requires an authenticated PlayMCP user. With Learning Path Check(우리 아이 뭐 배우지? 체크), return overdue, today's, and upcoming review activities and recommended rechecks in date order without modifying stored state.",
  inputSchema: getUpcomingLearningActionsInputSchema,
  handler,
};
