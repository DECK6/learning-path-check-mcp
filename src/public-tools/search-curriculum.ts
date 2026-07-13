import { z } from "zod";
import type { ToolDefinition } from "../lib/types.js";
import { searchCurriculum } from "../domain/search.js";
import { conceptView, toolResult } from "./common.js";

export const searchCurriculumInputSchema = z.object({
  query: z.string().min(1).max(200),
  schoolLevel: z.enum(["elementary", "middle", "high"]).optional(),
  subject: z.string().min(1).max(50).optional(),
  grade: z.number().int().min(1).max(6).optional(),
  limit: z.number().int().min(1).max(10).optional().default(5),
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
