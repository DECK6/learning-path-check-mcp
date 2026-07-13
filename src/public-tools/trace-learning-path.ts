import { z } from "zod";
import type { ToolDefinition } from "../lib/types.js";
import { learningGraph, type GraphStep } from "../domain/graph.js";
import { pathMarkdown } from "../presenters/concept-markdown.js";
import { conceptView, toolResult } from "./common.js";

export const traceLearningPathInputSchema = z.object({
  conceptId: z.string().min(1),
  maxDepth: z.number().int().min(1).max(6).optional().default(6),
});

function edgeView(step: GraphStep): Record<string, unknown> {
  return {
    depth: step.depth,
    concept: conceptView(step.concept),
    relation: {
      id: step.edge.id,
      kind: step.edge.kind,
      relationKind: step.edge.relationKind,
      strength: step.edge.strength,
      scope: step.edge.scope,
      reason: step.edge.reason,
      basis: step.edge.basis,
      basisKind: step.edge.basisKind,
      reviewStatus: step.edge.reviewStatus,
      sourceRefs: step.edge.sourceRefs,
    },
  };
}

async function handler(rawInput: unknown) {
  const input = traceLearningPathInputSchema.parse(rawInput ?? {});
  const target = learningGraph.require(input.conceptId);
  const prerequisites = learningGraph.prerequisites(target.id, input.maxDepth);
  const forward = learningGraph.successors(target.id, input.maxDepth);
  const successors = forward.filter((step) => step.edge.kind === "prerequisite");
  const transitions: GraphStep[] = [
    ...forward.filter((step) => step.edge.kind === "transition" || step.edge.kind === "subject-continuation" || step.edge.kind === "course-relation"),
    ...(target.courseId ? learningGraph.courseTransitions(target.courseId) : []),
    ...(target.schoolLevel === "elementary" ? learningGraph.subjectContinuations(target.subjectKo) : []),
  ];
  const uniqueTransitions = [...new Map(transitions.map((step) => [`${step.edge.id}|${step.concept.id}`, step])).values()];
  return toolResult(pathMarkdown(target, prerequisites, successors, uniqueTransitions), {
    status: "ok",
    target: conceptView(target),
    prerequisites: prerequisites.map(edgeView),
    successors: successors.map(edgeView),
    transitions: uniqueTransitions.map(edgeView),
    semanticsNotice: "required-prerequisite와 recommended-before를 구분하며, 과정 수준 전이는 공식 이수 요건이 아닙니다.",
  });
}

export const traceLearningPathTool: ToolDefinition = {
  name: "trace_learning_path",
  title: "학습 경로 추적",
  description: "With Learning Path Check(우리 아이 뭐 배우지? 체크), trace reviewed concept-level prerequisites and successors across elementary, middle, and supported high-school curriculum while exposing relation basis and review status.",
  inputSchema: traceLearningPathInputSchema,
  handler,
};
