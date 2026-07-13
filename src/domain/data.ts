import { readFileSync } from "node:fs";
import type { CompiledConcept, CompiledEdge, CompiledMeta, SearchIndexRecord } from "../lib/types.js";

function load<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../data/compiled/${name}`, import.meta.url), "utf8")) as T;
}

export const concepts = Object.freeze(load<CompiledConcept[]>("concepts.json"));
export const edges = Object.freeze(load<CompiledEdge[]>("edges.json"));
export const searchIndex = Object.freeze(load<SearchIndexRecord[]>("search-index.json"));
export const compiledMeta = Object.freeze(load<CompiledMeta>("meta.json"));
