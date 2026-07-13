import { z } from "zod";
import { MAX_CHECK_ITEMS, MAX_RESPONSE_CHARS } from "../config/limits.js";
import { learningGraph } from "../domain/graph.js";
import { latestConceptStatuses } from "../domain/history.js";
import { judgmentReason, OUTCOMES, recommendedRecheckDate, statusDelta, statusForOutcome } from "../domain/judgment.js";
import { newId } from "../lib/id.js";
import type { ToolDefinition } from "../lib/types.js";
import { assessmentMarkdown } from "../presenters/report-markdown.js";
import { getUserStore } from "../store/store.js";
import type { ConceptStatus } from "../store/types.js";
import { conceptView, requireChild, timestamp, toolResult } from "./common.js";

export const assessLearningCheckInputSchema = z.object({
  childId: z.string().min(1),
  checkId: z.string().min(1),
  responses: z.array(z.object({
    questionId: z.string().min(1),
    outcome: z.enum(OUTCOMES),
    response: z.string().optional(),
  })).max(MAX_CHECK_ITEMS).optional().default([]),
  assessedAt: z.string().optional(),
});

async function handler(rawInput: unknown) {
  const input = assessLearningCheckInputSchema.parse(rawInput ?? {});
  const { child, scopeKey } = await requireChild(input.childId);
  const store = getUserStore();
  const check = await store.getCheck(scopeKey, input.checkId);
  if (!check || check.childId !== child.id) throw new Error("학습 점검을 찾을 수 없습니다.");

  const questionById = new Map(check.questions.map((question) => [question.id, question]));
  const responseById = new Map<string, (typeof input.responses)[number]>();
  for (const response of input.responses) {
    if (!questionById.has(response.questionId)) throw new Error(`점검에 포함되지 않은 questionId입니다: ${response.questionId}`);
    if (responseById.has(response.questionId)) throw new Error(`questionId 응답은 한 번만 전달해 주세요: ${response.questionId}`);
    responseById.set(response.questionId, response);
  }

  const assessedAt = timestamp(input.assessedAt);
  const previous = latestConceptStatuses((await store.listConceptStatuses(scopeKey, child.id)).filter((status) => status.assessedAt <= assessedAt));
  const provisional = check.questions.map((question) => {
    const response = responseById.get(question.id);
    const outcome = response?.outcome ?? "unknown";
    const status = statusForOutcome(outcome);
    return { question, response, outcome, status };
  });
  const recheckDate = recommendedRecheckDate(assessedAt.slice(0, 10), provisional.map((item) => item.status));
  const statuses: ConceptStatus[] = provisional.map(({ question, response, outcome, status }) => ({
    id: newId("status"),
    childId: child.id,
    conceptId: question.conceptId,
    checkId: check.id,
    questionId: question.id,
    status,
    outcome,
    ...(response?.response?.trim() ? { response: response.response.trim().slice(0, MAX_RESPONSE_CHARS) } : {}),
    reason: judgmentReason(status),
    delta: statusDelta(previous.get(question.conceptId)?.status, status),
    assessedAt,
    recommendedRecheckDate: recheckDate,
  }));
  await store.saveConceptStatuses(scopeKey, statuses);

  const firstReviewStatus = statuses
    .filter((status) => status.status === "review_needed")
    .sort((a, b) => (questionById.get(b.questionId)?.depth ?? 0) - (questionById.get(a.questionId)?.depth ?? 0) || a.questionId.localeCompare(b.questionId))[0];
  const firstReview = firstReviewStatus ? learningGraph.require(firstReviewStatus.conceptId) : undefined;
  const returnPath = firstReview ? learningGraph.path(firstReview.id, check.targetConceptId) : [];
  const resultRows = statuses.map((status) => ({
    statusId: status.id,
    questionId: status.questionId,
    concept: learningGraph.require(status.conceptId),
    status: status.status,
    delta: status.delta,
    reason: status.reason,
  }));
  return toolResult(assessmentMarkdown({ childId: child.id, checkId: check.id, targetConceptId: check.targetConceptId, results: resultRows, firstReview, recheckDate }), {
    status: "ok",
    childId: child.id,
    checkId: check.id,
    targetConceptId: check.targetConceptId,
    results: statuses.map((status) => ({ ...status, statusId: status.id, concept: conceptView(learningGraph.require(status.conceptId)) })),
    firstReview: firstReview ? conceptView(firstReview) : null,
    returnPath: returnPath.map((step) => ({ depth: step.depth, concept: conceptView(step.concept), relationId: step.edge.id, relationKind: step.edge.kind })),
    recommendedRecheckDate: recheckDate,
  });
}

export const assessLearningCheckTool: ToolDefinition = {
  name: "assess_learning_check",
  title: "학습 점검 판정",
  description: "With Learning Path Check(우리 아이 뭐 배우지? 체크), store a deterministic learning status for every question. Before calling, map the child's answer to outcome=ok|partial|fail|unknown; free text alone is never graded by this server.",
  inputSchema: assessLearningCheckInputSchema,
  handler,
};
