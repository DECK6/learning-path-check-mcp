import { DEFAULT_CHECK_ITEMS, MAX_CHECK_ITEMS } from "../config/limits.js";
import type { CompiledConcept } from "../lib/types.js";
import { learningGraph } from "./graph.js";

export interface QuestionDraft {
  conceptId: string;
  concept: CompiledConcept;
  prompt: string;
  expectedElements: string[];
  criterion: string;
  depth: number;
  orderReason: string;
}

export function buildQuestionDrafts(conceptId: string, itemCount = DEFAULT_CHECK_ITEMS): QuestionDraft[] {
  const target = learningGraph.require(conceptId);
  const count = Math.min(MAX_CHECK_ITEMS, Math.max(1, itemCount));
  const prerequisites = learningGraph.prerequisites(conceptId)
    .filter((step) => step.concept.nodeKind === "topic" && step.concept.assessmentPrompt)
    .sort((a, b) => b.depth - a.depth || a.concept.id.localeCompare(b.concept.id, "en"));
  const candidates = prerequisites.map((step) => ({ concept: step.concept, depth: step.depth }));
  if (target.nodeKind === "topic" && target.assessmentPrompt) candidates.push({ concept: target, depth: 0 });
  const selected = candidates.slice(0, count);
  if (!selected.length) throw new Error("이 개념에는 원천 데이터에서 확인 가능한 점검 문항이 없습니다.");
  return selected.map(({ concept, depth }) => ({
    conceptId: concept.id,
    concept,
    prompt: concept.assessmentPrompt as string,
    expectedElements: concept.evidence.slice(0, 2),
    criterion: "핵심 요소를 스스로 설명하거나 수행했는지에 따라 ok / partial / fail / unknown 중 하나로 매핑합니다.",
    depth,
    orderReason: depth === 0 ? "목표 개념을 마지막으로 확인합니다." : `목표보다 ${depth}단계 앞선 선수 개념이어서 기초 순서에 배치했습니다.`,
  }));
}
