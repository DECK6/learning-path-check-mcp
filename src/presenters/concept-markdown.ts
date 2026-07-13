import type { CompiledConcept } from "../lib/types.js";
import type { GraphStep } from "../domain/graph.js";
import { sanitizeLearningTerms } from "./terms.js";

export function conceptLine(concept: CompiledConcept): string {
  const codes = concept.standardCodes.length ? ` · ${concept.standardCodes.join(", ")}` : "";
  return `${concept.titleKo} (${concept.id}${codes})`;
}

export function pathMarkdown(target: CompiledConcept, prerequisites: GraphStep[], successors: GraphStep[], transitions: GraphStep[]): string {
  const lines = [
    `# ${target.titleKo}`,
    "",
    `- conceptId: ${target.id}`,
    `- 학교급·과목: ${target.schoolLevel} · ${target.subjectKo}`,
    `- 관련 성취기준: ${target.standardCodes.join(", ") || "과정 수준 노드"}`,
    "",
    "## 먼저 확인할 개념",
    ...(prerequisites.length ? prerequisites.map((step) => `- ${step.depth}단계: ${conceptLine(step.concept)} — ${step.edge.relationKind ?? step.edge.kind}; ${step.edge.reviewStatus ?? "상태 없음"}; 근거: ${step.edge.reason ?? step.edge.basis}`) : ["- 직접 연결된 선수 개념이 없습니다."]),
    "",
    "## 이후 학습",
    ...(successors.length ? successors.map((step) => `- ${step.depth}단계: ${conceptLine(step.concept)} — ${step.edge.relationKind ?? step.edge.kind}; 근거: ${step.edge.reason ?? step.edge.basis}`) : ["- 직접 연결된 후속 개념이 없습니다."]),
    "",
    "## 학교급·과목 전이",
    ...(transitions.length ? transitions.map((step) => `- ${step.depth}단계: ${conceptLine(step.concept)} — ${step.edge.reason ?? step.edge.basis} (${step.edge.reviewStatus ?? "상태 없음"})`) : ["- 연결된 전이가 없습니다."]),
  ];
  return sanitizeLearningTerms(lines.join("\n"));
}
