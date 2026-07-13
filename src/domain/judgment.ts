import { addDays } from "../lib/date.js";

export const OUTCOMES = ["ok", "partial", "fail", "unknown"] as const;
export type CheckOutcome = typeof OUTCOMES[number];
export type LearningStatus = "understood" | "review_needed" | "needs_more_info";
export type StatusDelta = "improved" | "same" | "regressed" | "new";

export function statusForOutcome(outcome: CheckOutcome): LearningStatus {
  if (outcome === "ok") return "understood";
  if (outcome === "partial" || outcome === "fail") return "review_needed";
  return "needs_more_info";
}

const rank: Record<LearningStatus, number> = { needs_more_info: 0, review_needed: 1, understood: 2 };

export function statusDelta(previous: LearningStatus | undefined, current: LearningStatus): StatusDelta {
  if (!previous) return "new";
  if (rank[current] > rank[previous]) return "improved";
  if (rank[current] < rank[previous]) return "regressed";
  return "same";
}

export function recommendedRecheckDate(assessedDate: string, statuses: LearningStatus[]): string {
  return addDays(assessedDate, statuses.some((status) => status === "review_needed") ? 7 : statuses.every((status) => status === "understood") ? 30 : 7);
}

export function judgmentReason(status: LearningStatus): string {
  if (status === "understood") return "현재 전달된 결과에서 핵심 요소를 스스로 설명하거나 수행한 것으로 확인되었습니다.";
  if (status === "review_needed") return "현재 전달된 결과에서 일부 핵심 요소를 다시 확인하는 것이 좋습니다.";
  return "현재 정보만으로는 판단하기 어려워 추가 답변이 필요합니다.";
}
