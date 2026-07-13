import { z } from "zod";
import type { ToolDefinition } from "../lib/types.js";
import { concepts } from "../domain/data.js";
import { normalizeSearch } from "../domain/search.js";
import { learningGraph } from "../domain/graph.js";
import { requireChild, conceptView, toolResult } from "./common.js";
import { getUserStore } from "../store/store.js";
import type { ConceptStatus } from "../store/types.js";

export const getCurriculumOverviewInputSchema = z.object({
  schoolLevel: z.enum(["elementary", "middle", "high"]).describe("조회할 학교급: elementary, middle, high"),
  grade: z.number().int().min(1).max(6).optional().describe("선택 학년 입력. 초등은 1~6 개별 학년 필터이며, 중·고등은 1~3 범위 검증용으로 개별 학년 일치를 보장하지 않습니다"),
  subject: z.string().min(1).max(50).describe("조회할 과목 또는 교과군(예: 수학, 과학)"),
  childId: z.string().min(1).optional().describe("저장된 점검 이력을 함께 표시할 기존 자녀 프로필 ID. 상태를 변경하지 않습니다"),
  limit: z.number().int().min(1).max(100).optional().default(30).describe("반환할 토픽 수. 기본 30, 최대 100"),
});

function gradeMatches(gradeBand: string | null, grade: number | undefined): boolean {
  if (!grade || !gradeBand) return true;
  const values = gradeBand.match(/\d+/g)?.map(Number) ?? [];
  return values.length >= 2 ? grade >= values[0] && grade <= values[1] : values[0] === grade;
}

async function handler(rawInput: unknown) {
  const input = getCurriculumOverviewInputSchema.parse(rawInput ?? {});
  if (input.schoolLevel !== "elementary" && input.grade && input.grade > 3) throw new Error("중·고등학교 학년은 1~3 범위여야 합니다.");
  const subject = normalizeSearch(input.subject);
  const matched = concepts.filter((concept) => concept.nodeKind === "topic" && concept.schoolLevel === input.schoolLevel && normalizeSearch(`${concept.subjectKo}${concept.subjectGroupKo ?? ""}`).includes(subject) && (input.schoolLevel === "middle" || gradeMatches(concept.gradeBand, input.grade)));
  if (!matched.length) return toolResult(`# 교육과정 개요 없음\n\n${input.schoolLevel} ${input.subject} 범위에서 토픽을 찾지 못했습니다.`, { status: "not_found", input, topics: [] });
  let child;
  const statusByConcept = new Map<string, ConceptStatus>();
  if (input.childId) {
    const required = await requireChild(input.childId);
    child = required.child;
    const statuses = await getUserStore().listConceptStatuses(required.scopeKey, child.id);
    for (const status of statuses) statusByConcept.set(status.conceptId, status);
  }
  const selected = [...matched]
    .sort((a, b) => Number(statusByConcept.has(b.id)) - Number(statusByConcept.has(a.id)) || a.id.localeCompare(b.id, "en"))
    .slice(0, input.limit);
  const domains = new Map<string, typeof selected>();
  for (const concept of selected) {
    const key = concept.domainKo ?? "통합 영역";
    if (!domains.has(key)) domains.set(key, []);
    domains.get(key)?.push(concept);
  }
  const rows = selected.map((concept) => {
    const current = statusByConcept.get(concept.id);
    return { ...conceptView(concept), currentStatus: current?.status ?? "not_checked", currentStatusId: current?.id, checkId: current?.checkId, questionId: current?.questionId };
  });
  const gradeNote = input.schoolLevel === "middle" ? "중학교 성취기준은 7~9학년군 단위이므로 개별 학년 배정을 단정하지 않습니다." : input.schoolLevel === "high" ? "고등학교 국가 과목은 학교별 편성 학년과 다를 수 있습니다." : "초등 학년군 기준으로 표시합니다.";
  const markdown = [`# ${input.subject} 교육과정 개요`, "", `- 학교급: ${input.schoolLevel}${input.grade ? ` ${input.grade}학년` : ""}`, `- ${gradeNote}`, ...(child ? [`- childId: ${child.id} · ${child.nickname} 이력 반영`] : []), "", ...[...domains].map(([domain, values]) => `## ${domain}\n${values.map((concept) => {
    const current = statusByConcept.get(concept.id);
    return `- ${concept.titleKo} — conceptId: ${concept.id} · ${concept.standardCodes.join(", ") || "코드 없음"} · 상태 ${current?.status ?? "미점검"}${current ? ` · statusId: ${current.id} · checkId: ${current.checkId} · questionId: ${current.questionId}` : ""}`;
  }).join("\n")}`)].join("\n");
  return toolResult(markdown, { status: "ok", input, childId: child?.id, gradeNote, totalMatches: matched.length, returned: rows.length, topics: rows, nextConceptIds: selected.slice(0, 5).map((concept) => learningGraph.successors(concept.id, 1)[0]?.concept.id).filter(Boolean) });
}

export const getCurriculumOverviewTool: ToolDefinition = {
  name: "get_curriculum_overview",
  title: "교육과정 개요",
  description: "With Learning Path Check(우리 아이 뭐 배우지? 체크), show curriculum domains, standards, and topics for a school level and subject. Optional childId only overlays that authenticated user's stored check history and never changes state.",
  inputSchema: getCurriculumOverviewInputSchema,
  handler,
};
