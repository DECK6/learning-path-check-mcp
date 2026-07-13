import { z } from "zod";
import type { ToolDefinition } from "../lib/types.js";
import { searchCurriculum } from "../domain/search.js";
import { conceptView, toolResult } from "./common.js";

export const searchCurriculumInputSchema = z.object({
  query: z.string().min(1).max(200).describe("찾고 싶은 개념·과목·영역·성취기준 코드 또는 자연어 질문"),
  schoolLevel: z.enum(["elementary", "middle", "high"]).optional().describe("선택 학교급 필터: elementary, middle, high"),
  subject: z.string().min(1).max(50).optional().describe("선택 과목 또는 교과군 필터(예: 수학, 과학)"),
  grade: z.number().int().min(1).max(6).optional().describe("선택 학년 입력. 초등은 1~6 개별 학년 필터이며, 중·고등은 1~3 범위 검증용으로 개별 학년 일치를 보장하지 않습니다"),
  limit: z.number().int().min(1).max(10).optional().default(5).describe("반환 후보 수. 기본 5, 최대 10"),
});

async function handler(rawInput: unknown) {
  const input = searchCurriculumInputSchema.parse(rawInput ?? {});
  const result = searchCurriculum(input);
  if (result.outOfScope) return toolResult(`# 지원 범위 안내\n\n${result.scopeNotice}`, { status: "out_of_scope", query: input.query, results: [], scopeNotice: result.scopeNotice });
  if (!result.matches.length) return toolResult(`# 검색 결과 없음\n\n'${input.query}'에 해당하는 교육과정 개념을 찾지 못했습니다. 학교급·과목·성취기준 코드를 함께 알려주세요.`, { status: "not_found", query: input.query, ambiguous: false, results: [] });
  const views = result.matches.map((match) => ({ ...conceptView(match.concept), score: match.score, matchReason: match.matchReason }));
  const prompt = result.ambiguous ? "후보 점수가 비슷합니다. 어느 conceptId인지 알려주세요." : "가장 관련 있는 후보를 먼저 표시했습니다.";
  const markdown = [`# 교육과정 검색 결과`, "", prompt, "", ...result.matches.map((match) => `- ${match.concept.titleKo} — conceptId: ${match.concept.id} · ${match.concept.schoolLevel}/${match.concept.subjectKo} · ${match.concept.standardCodes.join(", ") || "과정 수준"} · ${match.matchReason}`)].join("\n");
  return toolResult(markdown, { status: "ok", query: input.query, ambiguous: result.ambiguous, results: views });
}

export const searchCurriculumTool: ToolDefinition = {
  name: "search_curriculum",
  title: "교육과정 검색",
  description: "With Learning Path Check(우리 아이 뭐 배우지? 체크), search deterministic Korean elementary, middle, and non-vocational high-school curriculum concepts. Do not guess when ambiguous; ask the user to select a returned conceptId.",
  inputSchema: searchCurriculumInputSchema,
  handler,
};
