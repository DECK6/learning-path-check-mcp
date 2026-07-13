import { describe, expect, test } from "bun:test";
import { compiledMeta, concepts, edges } from "../src/domain/data.js";
import { LearningGraph, learningGraph } from "../src/domain/graph.js";
import { buildPlanDraft } from "../src/domain/plan-builder.js";

const FRACTION_TARGET = "kr.mt.math.number-operations.g5-6.s6-01-09.application";

describe("compiled curriculum graph", () => {
  test("all references and standards are present", () => {
    const ids = new Set(concepts.map((concept) => concept.id));
    for (const edge of edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
      expect(edge.from).not.toBe(edge.to);
    }
    const topics = concepts.filter((concept) => concept.nodeKind === "topic");
    expect(topics).toHaveLength(7_240);
    expect(concepts).toHaveLength(7_506);
    expect(edges).toHaveLength(7_100);
    expect(topics.every((concept) => concept.standardCodes.length > 0)).toBe(true);
    expect(new Set(edges.map((edge) => edge.id)).size).toBe(edges.length);
    expect(compiledMeta.exclusions).toMatchObject({ highVocationalCourses: 528, highVocationalTopics: 47_625 });
  });

  test("prerequisite graph is acyclic", () => {
    const prerequisiteEdges = edges.filter((edge) => edge.kind === "prerequisite");
    const nodes = new Set(prerequisiteEdges.flatMap((edge) => [edge.from, edge.to]));
    const indegree = new Map([...nodes].map((id) => [id, 0]));
    const outgoing = new Map<string, string[]>();
    for (const edge of prerequisiteEdges) {
      indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      outgoing.get(edge.from)?.push(edge.to);
    }
    const queue = [...nodes].filter((id) => indegree.get(id) === 0);
    let visited = 0;
    for (let index = 0; index < queue.length; index += 1) {
      visited += 1;
      for (const next of outgoing.get(queue[index]) ?? []) {
        indegree.set(next, (indegree.get(next) ?? 1) - 1);
        if (indegree.get(next) === 0) queue.push(next);
      }
    }
    expect(visited).toBe(nodes.size);
  });

  test("fraction division has a deep reviewed prerequisite path", () => {
    const prerequisites = learningGraph.prerequisites(FRACTION_TARGET, 6);
    expect(prerequisites.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...prerequisites.map((step) => step.depth))).toBeGreaterThanOrEqual(2);
    expect(prerequisites.every((step) => step.edge.reviewStatus)).toBe(true);
  });

  test("custom graph topological sort uses its own edges and walk guards cycles", () => {
    const nodes = concepts.slice(0, 3).map((concept, index) => ({ ...concept, id: `test-${index}` }));
    const graph = new LearningGraph(nodes, [
      { id: "e1", from: "test-0", to: "test-1", kind: "prerequisite", basis: "test", sourceRefs: [] },
      { id: "e2", from: "test-1", to: "test-2", kind: "prerequisite", basis: "test", sourceRefs: [] },
      { id: "e3", from: "test-2", to: "test-0", kind: "prerequisite", basis: "test", sourceRefs: [] },
    ]);
    expect(graph.prerequisites("test-0", 6)).toHaveLength(2);
    expect(graph.topologicalSort(["test-2", "test-1", "test-0"])).toEqual(["test-2", "test-1", "test-0"]);
  });

  test("review plans topologically order foundations and round-robin them", () => {
    const foundational = "kr.mt.math.number-operations.g5-6.s6-01-08.application";
    const concept = "kr.mt.math.number-operations.g5-6.s6-01-09.concept";
    const representation = "kr.mt.math.number-operations.g5-6.s6-01-09.representation";
    const plan = buildPlanDraft({
      planId: "plan-test",
      targetConceptId: FRACTION_TARGET,
      reviewConceptIds: [representation, concept, foundational],
      durationWeeks: 1,
      minutesPerDay: 20,
      startDate: "2026-07-14",
    });
    expect(plan.orderedConceptIds).toEqual([foundational, concept, representation]);
    expect(plan.activities.map((activity) => activity.conceptId)).toEqual([foundational, concept, representation, foundational, concept, representation, foundational]);
    expect(plan.targetRetryDate).toBe("2026-07-21");
    expect(plan.calendarEvents).toHaveLength(8);
  });
});
