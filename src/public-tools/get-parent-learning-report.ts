import { z } from "zod";
import { collectUpcomingActions, latestActivityProgress, latestConceptStatuses } from "../domain/history.js";
import { learningGraph } from "../domain/graph.js";
import { addDays, currentDate, daysBetween, isoDate } from "../lib/date.js";
import type { ToolDefinition } from "../lib/types.js";
import { parentReportMarkdown } from "../presenters/report-markdown.js";
import { getUserStore } from "../store/store.js";
import { conceptView, requireChild, toolResult } from "./common.js";

export const getParentLearningReportInputSchema = z.object({
  childId: z.string().min(1).describe("리포트를 조회할 기존 자녀 프로필 ID"),
  period: z.enum(["weekly", "monthly"]).optional().default("weekly").describe("기본 조회 기간: weekly 또는 monthly. from/to를 직접 주면 날짜 범위를 우선합니다"),
  from: z.string().optional().describe("선택 시작일(YYYY-MM-DD, 포함). 생략하면 period 기준으로 계산합니다"),
  to: z.string().optional().describe("선택 종료일(YYYY-MM-DD, 포함). 생략하면 현재 날짜이며 from보다 빠를 수 없습니다"),
});

async function handler(rawInput: unknown) {
  const input = getParentLearningReportInputSchema.parse(rawInput ?? {});
  const { child, scopeKey } = await requireChild(input.childId);
  const to = isoDate(input.to ?? currentDate());
  const defaultDays = input.period === "weekly" ? 7 : 30;
  const from = isoDate(input.from ?? addDays(to, -(defaultDays - 1)));
  if (from > to) throw new Error("리포트 시작일은 종료일보다 늦을 수 없습니다.");
  const durationDays = daysBetween(from, to) + 1;
  const previousFrom = addDays(from, -durationDays);
  const previousTo = addDays(from, -1);
  const store = getUserStore();
  const [allStatuses, allProgress, plans] = await Promise.all([
    store.listConceptStatuses(scopeKey, child.id),
    store.listProgress(scopeKey, child.id),
    store.listPlans(scopeKey, child.id),
  ]);
  const inDates = (value: string, start: string, end: string) => value.slice(0, 10) >= start && value.slice(0, 10) <= end;
  const currentStatuses = latestConceptStatuses(allStatuses.filter((status) => inDates(status.assessedAt, from, to)));
  const previousStatuses = latestConceptStatuses(allStatuses.filter((status) => inDates(status.assessedAt, previousFrom, previousTo)));
  const byLearningStatus = (status: "understood" | "review_needed" | "needs_more_info") => [...currentStatuses.values()].filter((value) => value.status === status).map((value) => learningGraph.require(value.conceptId));
  const understood = byLearningStatus("understood");
  const review = byLearningStatus("review_needed");
  const moreInfo = byLearningStatus("needs_more_info");

  const currentProgress = allProgress.filter((record) => inDates(record.recordedAt, from, to));
  const completed = [...latestActivityProgress(currentProgress).values()].filter((record) => record.status === "completed");
  const previousUnderstood = [...previousStatuses.values()].filter((status) => status.status === "understood").length;
  const understoodDifference = understood.length - previousUnderstood;
  const improved = [...currentStatuses.values()].filter((status) => status.delta === "improved").length;
  const understoodChange = understoodDifference > 0 ? `${understoodDifference}개 늘었고` : understoodDifference < 0 ? `${Math.abs(understoodDifference)}개 줄었고` : "같고";
  const changeSummary = previousStatuses.size === 0
    ? `이전 기간 점검 기록이 없어 이번 기간 ${currentStatuses.size}개 개념을 첫 비교 기준으로 삼습니다.`
    : `이해한 것으로 확인된 개념 수가 이전 기간보다 ${understoodChange}, 개별 재점검에서 개선으로 기록된 개념은 ${improved}개입니다.`;
  const priorities = [...review, ...moreInfo].slice(0, 5);
  const eligibleStatuses = allStatuses.filter((status) => status.assessedAt.slice(0, 10) <= to);
  const upcoming = collectUpcomingActions({ plans, progress: allProgress, statuses: eligibleStatuses, asOf: addDays(to, 1), daysAhead: 30 }).slice(0, 30);
  const upcomingForMarkdown = upcoming.map((action) => ({
    date: action.date,
    concept: learningGraph.require(action.conceptId),
    kind: action.kind === "review_activity" ? "복습 활동" : "재점검",
    planId: action.planId,
    activityId: action.activityId,
    statusId: action.statusId,
    checkId: action.checkId,
    questionId: action.questionId,
  }));
  const completedRecords = completed.map((record) => ({
    progressId: record.id,
    planId: record.planId,
    activityId: record.activityId,
    concept: learningGraph.require(record.conceptId),
  }));
  const statusRecords = [...currentStatuses.values()].map((record) => ({ statusId: record.id, checkId: record.checkId, questionId: record.questionId, status: record.status, concept: learningGraph.require(record.conceptId) }));
  return toolResult(parentReportMarkdown({ childId: child.id, nickname: child.nickname, from, to, understood, review, moreInfo, completedRecords, statusRecords, changeSummary, priorities, upcoming: upcomingForMarkdown }), {
    status: "ok",
    childId: child.id,
    period: input.period,
    range: { from, to },
    previousRange: { from: previousFrom, to: previousTo },
    summary: {
      checkedConcepts: currentStatuses.size,
      understood: understood.length,
      reviewNeeded: review.length,
      needsMoreInfo: moreInfo.length,
      completedActivities: completed.length,
    },
    understood: understood.map(conceptView),
    reviewNeeded: review.map(conceptView),
    needsMoreInfo: moreInfo.map(conceptView),
    statusRecords: [...currentStatuses.values()].map((record) => ({ ...record, statusId: record.id, concept: conceptView(learningGraph.require(record.conceptId)) })),
    completedActivities: completed.map((record) => ({ ...record, progressId: record.id, concept: conceptView(learningGraph.require(record.conceptId)) })),
    changeSummary,
    priorities: priorities.map(conceptView),
    upcoming: upcoming.map((action) => ({ ...action, concept: conceptView(learningGraph.require(action.conceptId)) })),
  });
}

export const getParentLearningReportTool: ToolDefinition = {
  name: "get_parent_learning_report",
  title: "학부모 학습 리포트",
  description: "Requires an authenticated PlayMCP user. With Learning Path Check(우리 아이 뭐 배우지? 체크), summarize a child's weekly or monthly checks, review activity, observed change, priorities, and rechecks without grading or labeling the child.",
  inputSchema: getParentLearningReportInputSchema,
  handler,
};
