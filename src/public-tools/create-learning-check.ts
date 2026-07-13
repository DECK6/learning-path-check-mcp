import { z } from "zod";
import { DEFAULT_CHECK_ITEMS, MAX_CHECK_ITEMS } from "../config/limits.js";
import type { ToolDefinition } from "../lib/types.js";
import { newId } from "../lib/id.js";
import { buildQuestionDrafts } from "../domain/question-builder.js";
import { learningGraph } from "../domain/graph.js";
import { getUserStore } from "../store/store.js";
import type { LearningCheck } from "../store/types.js";
import { requireChild, timestamp, toolResult } from "./common.js";

export const createLearningCheckInputSchema = z.object({
  childId: z.string().min(1),
  conceptId: z.string().min(1),
  observedDifficulty: z.string().max(500).optional(),
  itemCount: z.number().int().min(1).max(MAX_CHECK_ITEMS).optional().default(DEFAULT_CHECK_ITEMS),
  createdAt: z.string().optional(),
});

async function handler(rawInput: unknown) {
  const input = createLearningCheckInputSchema.parse(rawInput ?? {});
  const { child, scopeKey } = await requireChild(input.childId);
  const target = learningGraph.require(input.conceptId);
  const checkId = newId("check");
  const drafts = buildQuestionDrafts(target.id, input.itemCount);
  const check: LearningCheck = {
    id: checkId,
    childId: child.id,
    targetConceptId: target.id,
    ...(input.observedDifficulty ? { observedDifficulty: input.observedDifficulty } : {}),
    questions: drafts.map((draft, index) => ({
      id: `${checkId}-q${index + 1}`,
      conceptId: draft.conceptId,
      prompt: draft.prompt,
      expectedElements: draft.expectedElements,
      criterion: draft.criterion,
      depth: draft.depth,
      orderReason: draft.orderReason,
    })),
    createdAt: timestamp(input.createdAt),
  };
  await getUserStore().saveCheck(scopeKey, check);
  const markdown = [`# 학습 점검 생성`, "", `- childId: ${child.id}`, `- checkId: ${check.id}`, `- 목표 conceptId: ${target.id}`, "", ...check.questions.map((question, index) => `## ${index + 1}. ${learningGraph.require(question.conceptId).titleKo}\n- questionId: ${question.id}\n- conceptId: ${question.conceptId}\n- 질문: ${question.prompt}\n- 기대 핵심 요소: ${question.expectedElements.join(" / ") || "원천 증거 없음"}\n- 판정 기준: ${question.criterion}\n- 순서 이유: ${question.orderReason}`)].join("\n");
  return toolResult(markdown, { status: "ok", childId: child.id, checkId: check.id, targetConceptId: target.id, questions: check.questions.map((question) => ({ ...question, questionId: question.id })) });
}

export const createLearningCheckTool: ToolDefinition = {
  name: "create_learning_check",
  title: "학습 점검 생성",
  description: "With Learning Path Check(우리 아이 뭐 배우지? 체크), create deterministic check questions only from compiled assessment prompts and evidence for a target concept and its reviewed prerequisites.",
  inputSchema: createLearningCheckInputSchema,
  handler,
};
