import type { CompiledConcept } from "../lib/types.js";
import { sanitizeLearningTerms } from "./terms.js";

export function assessmentMarkdown(input: {
  childId: string;
  checkId: string;
  targetConceptId: string;
  results: Array<{ statusId: string; questionId: string; concept: CompiledConcept; status: string; delta: string; reason: string }>;
  firstReview?: CompiledConcept;
  recheckDate: string;
}): string {
  const lines = [
    "# 학습 점검 결과",
    "",
    `- childId: ${input.childId}`,
    `- checkId: ${input.checkId}`,
    `- 목표 conceptId: ${input.targetConceptId}`,
    `- 권장 재점검일: ${input.recheckDate}`,
    "",
    ...input.results.map((result) => `- ${result.concept.titleKo} (${result.concept.id}): ${result.status} · 변화 ${result.delta} — ${result.reason}\n  - questionId: ${result.questionId}\n  - statusId: ${result.statusId}\n  - 성취기준: ${result.concept.standardCodes.join(", ") || "과정 수준"}`),
    "",
    input.firstReview ? `가장 먼저 복습할 지점은 ${input.firstReview.titleKo} (${input.firstReview.id})입니다.` : "현재 결과에서는 추가 복습 지점을 확정하지 않았습니다.",
  ];
  return sanitizeLearningTerms(lines.join("\n"));
}

export function parentReportMarkdown(input: {
  childId: string;
  nickname: string;
  from: string;
  to: string;
  understood: CompiledConcept[];
  review: CompiledConcept[];
  moreInfo: CompiledConcept[];
  completedRecords: Array<{ progressId: string; planId: string; activityId?: string; concept: CompiledConcept }>;
  statusRecords: Array<{ statusId: string; checkId: string; questionId: string; status: string; concept: CompiledConcept }>;
  changeSummary: string;
  priorities: CompiledConcept[];
  upcoming: Array<{ date: string; concept: CompiledConcept; kind: string; planId?: string; activityId?: string; statusId?: string; checkId?: string; questionId?: string }>;
}): string {
  const label = (concept: CompiledConcept) => `${concept.titleKo} (${concept.id}; ${concept.standardCodes.join(", ") || "과정 수준"})`;
  const list = (values: CompiledConcept[]) => values.length ? values.map(label).join(", ") : "없음";
  return sanitizeLearningTerms([
    `# ${input.nickname} 학부모 학습 리포트`,
    "",
    `- childId: ${input.childId}`,
    `- 기간: ${input.from} ~ ${input.to}`,
    `- 이해한 것으로 확인된 개념: ${list(input.understood)}`,
    `- 한 번 더 복습할 개념: ${list(input.review)}`,
    `- 추가 답변이 필요한 개념: ${list(input.moreInfo)}`,
    `- 완료한 복습 활동: ${input.completedRecords.length}개`,
    `- 이전 기간 대비 변화: ${input.changeSummary}`,
    "",
    "## 기간 내 최신 점검 기록",
    ...(input.statusRecords.length ? input.statusRecords.map((record) => `- statusId: ${record.statusId} · checkId: ${record.checkId} · questionId: ${record.questionId} · ${record.status} · ${label(record.concept)}`) : ["- 이 기간의 점검 기록이 없습니다."]),
    "",
    "## 완료 기록",
    ...(input.completedRecords.length ? input.completedRecords.map((record) => `- progressId: ${record.progressId} · planId: ${record.planId}${record.activityId ? ` · activityId: ${record.activityId}` : ""} · ${label(record.concept)}`) : ["- 완료 기록이 없습니다."]),
    "",
    "## 다음 우선순위",
    ...(input.priorities.length ? input.priorities.map((concept) => `- ${label(concept)}`) : ["- 현재 기간 기록만으로 정한 우선순위가 없습니다."]),
    "",
    "## 다음 행동",
    ...(input.upcoming.length ? input.upcoming.map((action) => `- ${action.date}: ${action.kind} — ${label(action.concept)}${action.planId ? ` · planId: ${action.planId}` : ""}${action.activityId ? ` · activityId: ${action.activityId}` : ""}${action.statusId ? ` · statusId: ${action.statusId}` : ""}${action.checkId ? ` · checkId: ${action.checkId}` : ""}${action.questionId ? ` · questionId: ${action.questionId}` : ""}`) : ["- 예정된 행동이 없습니다."]),
  ].join("\n"));
}
