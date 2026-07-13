import { MAX_TRACE_DEPTH } from "../config/limits.js";
import type { CompiledConcept, CompiledEdge } from "../lib/types.js";
import { concepts, edges } from "./data.js";

export interface GraphStep {
  concept: CompiledConcept;
  edge: CompiledEdge;
  depth: number;
}

export class LearningGraph {
  readonly byId = new Map<string, CompiledConcept>();
  readonly incoming = new Map<string, CompiledEdge[]>();
  readonly outgoing = new Map<string, CompiledEdge[]>();
  private readonly graphEdges: readonly CompiledEdge[];

  constructor(nodes: readonly CompiledConcept[], graphEdges: readonly CompiledEdge[]) {
    this.graphEdges = graphEdges;
    for (const node of nodes) this.byId.set(node.id, node);
    for (const edge of graphEdges) {
      if (!this.byId.has(edge.from) || !this.byId.has(edge.to)) throw new Error(`Dangling graph edge: ${edge.id}`);
      if (!this.outgoing.has(edge.from)) this.outgoing.set(edge.from, []);
      if (!this.incoming.has(edge.to)) this.incoming.set(edge.to, []);
      this.outgoing.get(edge.from)?.push(edge);
      this.incoming.get(edge.to)?.push(edge);
    }
    for (const values of [...this.incoming.values(), ...this.outgoing.values()]) values.sort((a, b) => a.id.localeCompare(b.id, "en"));
  }

  get(id: string): CompiledConcept | undefined {
    return this.byId.get(id);
  }

  require(id: string): CompiledConcept {
    const concept = this.get(id);
    if (!concept) throw new Error(`교육과정 개념을 찾을 수 없습니다: ${id}`);
    return concept;
  }

  prerequisites(id: string, maxDepth = MAX_TRACE_DEPTH): GraphStep[] {
    return this.walk(id, "incoming", maxDepth, (edge) => edge.kind === "prerequisite");
  }

  successors(id: string, maxDepth = MAX_TRACE_DEPTH): GraphStep[] {
    return this.walk(id, "outgoing", maxDepth, (edge) => edge.kind === "prerequisite" || edge.kind === "transition" || edge.kind === "course-relation" || edge.kind === "subject-continuation");
  }

  courseTransitions(courseId: string): GraphStep[] {
    const values = this.outgoing.get(courseId) ?? [];
    return values
      .filter((edge) => edge.kind === "transition" || edge.kind === "course-relation")
      .map((edge) => ({ concept: this.require(edge.to), edge, depth: 1 }));
  }

  subjectContinuations(subjectKo: string): GraphStep[] {
    const subjectNode = [...this.byId.values()].find((node) => node.schoolLevel === "elementary" && node.nodeKind === "course" && node.subjectKo === subjectKo);
    if (!subjectNode) return [];
    return (this.outgoing.get(subjectNode.id) ?? [])
      .filter((edge) => edge.kind === "subject-continuation")
      .map((edge) => ({ concept: this.require(edge.to), edge, depth: 1 }));
  }

  topologicalSort(ids: string[]): string[] {
    const selected = [...new Set(ids)].filter((id) => this.byId.has(id));
    const selectedSet = new Set(selected);
    const orderIndex = new Map(selected.map((id, index) => [id, index]));
    const indegree = new Map(selected.map((id) => [id, 0]));
    const outgoing = new Map<string, string[]>();
    for (const edge of this.graphEdges) {
      if (edge.kind !== "prerequisite" || !selectedSet.has(edge.from) || !selectedSet.has(edge.to)) continue;
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      outgoing.get(edge.from)?.push(edge.to);
      indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    }
    const queue = selected.filter((id) => indegree.get(id) === 0);
    queue.sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
    const result: string[] = [];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const id = queue[cursor];
      result.push(id);
      for (const next of outgoing.get(id) ?? []) {
        indegree.set(next, (indegree.get(next) ?? 1) - 1);
        if (indegree.get(next) === 0) queue.push(next);
      }
    }
    return result.length === selected.length ? result : selected;
  }

  path(from: string, to: string, maxDepth = MAX_TRACE_DEPTH): GraphStep[] {
    if (from === to) return [];
    const queue: Array<{ id: string; steps: GraphStep[] }> = [{ id: from, steps: [] }];
    const visited = new Set([from]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current.steps.length >= maxDepth) continue;
      for (const edge of this.outgoing.get(current.id) ?? []) {
        if (edge.kind !== "prerequisite" && edge.kind !== "transition") continue;
        if (visited.has(edge.to)) continue;
        const step = { concept: this.require(edge.to), edge, depth: current.steps.length + 1 };
        const steps = [...current.steps, step];
        if (edge.to === to) return steps;
        visited.add(edge.to);
        queue.push({ id: edge.to, steps });
      }
    }
    return [];
  }

  private walk(id: string, direction: "incoming" | "outgoing", maxDepth: number, include: (edge: CompiledEdge) => boolean): GraphStep[] {
    this.require(id);
    const result: GraphStep[] = [];
    const queue: Array<{ id: string; depth: number }> = [{ id, depth: 0 }];
    const visited = new Set([id]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      if (current.depth >= maxDepth) continue;
      const adjacent = direction === "incoming" ? this.incoming.get(current.id) : this.outgoing.get(current.id);
      for (const edge of adjacent ?? []) {
        if (!include(edge)) continue;
        const nextId = direction === "incoming" ? edge.from : edge.to;
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        const depth = current.depth + 1;
        result.push({ concept: this.require(nextId), edge, depth });
        queue.push({ id: nextId, depth });
      }
    }
    return result;
  }
}

export const learningGraph = new LearningGraph(concepts, edges);
