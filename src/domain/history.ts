import { addDays, isoDate } from "../lib/date.js";
import type { ConceptStatus, LearningProgress, ReviewPlan } from "../store/types.js";

export type ActionTiming = "overdue" | "today" | "upcoming";

export interface UpcomingAction {
  kind: "review_activity" | "recheck";
  timing: ActionTiming;
  date: string;
  conceptId: string;
  planId?: string;
  activityId?: string;
  statusId?: string;
  checkId?: string;
  questionId?: string;
  progressStatus?: LearningProgress["status"];
  minutes?: number;
}

export function latestConceptStatuses(statuses: readonly ConceptStatus[]): Map<string, ConceptStatus> {
  const latest = new Map<string, ConceptStatus>();
  for (const status of statuses) {
    const previous = latest.get(status.conceptId);
    if (!previous || status.assessedAt > previous.assessedAt || (status.assessedAt === previous.assessedAt && status.id > previous.id)) {
      latest.set(status.conceptId, status);
    }
  }
  return latest;
}

export function latestActivityProgress(progress: readonly LearningProgress[]): Map<string, LearningProgress> {
  const latest = new Map<string, LearningProgress>();
  for (const record of progress) {
    if (!record.activityId) continue;
    const key = `${record.planId}|${record.activityId}`;
    const previous = latest.get(key);
    if (!previous || record.recordedAt > previous.recordedAt || (record.recordedAt === previous.recordedAt && record.id > previous.id)) latest.set(key, record);
  }
  return latest;
}

export function collectUpcomingActions(input: {
  plans: readonly ReviewPlan[];
  progress: readonly LearningProgress[];
  statuses: readonly ConceptStatus[];
  asOf: string;
  daysAhead: number;
}): UpcomingAction[] {
  const asOf = isoDate(input.asOf);
  const through = addDays(asOf, input.daysAhead);
  const progressByActivity = latestActivityProgress(input.progress);
  const progressByPlanConcept = new Map<string, LearningProgress>();
  for (const record of input.progress) {
    if (record.activityId) continue;
    const key = `${record.planId}|${record.conceptId}`;
    const previous = progressByPlanConcept.get(key);
    if (!previous || record.recordedAt > previous.recordedAt || (record.recordedAt === previous.recordedAt && record.id > previous.id)) progressByPlanConcept.set(key, record);
  }
  const actions: UpcomingAction[] = [];
  const timing = (date: string): ActionTiming => date < asOf ? "overdue" : date === asOf ? "today" : "upcoming";

  for (const plan of input.plans) {
    for (const activity of plan.activities) {
      if (activity.date > through) continue;
      const latest = progressByActivity.get(`${plan.id}|${activity.activityId}`);
      if (latest?.status === "completed" || latest?.status === "skipped") continue;
      actions.push({
        kind: "review_activity",
        timing: timing(activity.date),
        date: activity.date,
        conceptId: activity.conceptId,
        planId: plan.id,
        activityId: activity.activityId,
        ...(latest ? { progressStatus: latest.status } : { progressStatus: "planned" as const }),
        minutes: activity.minutes,
      });
    }
    const targetProgress = progressByPlanConcept.get(`${plan.id}|${plan.targetConceptId}`);
    if (plan.targetRetryDate <= through && targetProgress?.status !== "completed" && targetProgress?.status !== "skipped") {
      const existing = actions.find((action) => action.kind === "recheck" && action.date === plan.targetRetryDate && action.conceptId === plan.targetConceptId);
      if (!existing) actions.push({ kind: "recheck", timing: timing(plan.targetRetryDate), date: plan.targetRetryDate, conceptId: plan.targetConceptId, planId: plan.id });
    }
  }

  for (const status of latestConceptStatuses(input.statuses).values()) {
    const date = status.recommendedRecheckDate;
    if (date > through) continue;
    const existing = actions.find((action) => action.kind === "recheck" && action.date === date && action.conceptId === status.conceptId);
    if (existing) {
      existing.statusId = status.id;
      existing.checkId = status.checkId;
      existing.questionId = status.questionId;
    } else actions.push({ kind: "recheck", timing: timing(date), date, conceptId: status.conceptId, statusId: status.id, checkId: status.checkId, questionId: status.questionId });
  }

  const timingRank: Record<ActionTiming, number> = { overdue: 0, today: 1, upcoming: 2 };
  return actions.sort((a, b) => a.date.localeCompare(b.date) || timingRank[a.timing] - timingRank[b.timing] || a.kind.localeCompare(b.kind) || a.conceptId.localeCompare(b.conceptId, "en"));
}
