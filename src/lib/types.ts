import type { z } from "zod";

export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpToolResult {
  content: McpTextContent[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: unknown) => Promise<McpToolResult> | McpToolResult;
}

export type SchoolLevel = "elementary" | "middle" | "high";

export interface CompiledConcept {
  id: string;
  nodeKind: "topic" | "course";
  schoolLevel: SchoolLevel;
  subjectKo: string;
  subjectGroupKo?: string;
  courseId?: string;
  domainKo?: string;
  gradeBand: string | null;
  titleKo: string;
  summary: string;
  standardCodes: string[];
  topicType?: string;
  assessmentPrompt?: string;
  evidence: string[];
  verificationStatus: string;
  sourceRefs: string[];
}

export type CompiledEdgeKind = "prerequisite" | "course-relation" | "transition" | "subject-continuation";

export interface CompiledEdge {
  id: string;
  from: string;
  to: string;
  kind: CompiledEdgeKind;
  relationKind?: string;
  strength?: string;
  scope?: string;
  reason?: string;
  basis: string;
  basisKind?: string;
  reviewStatus?: string;
  sourceRefs: string[];
}

export interface SearchIndexRecord {
  id: string;
  compact: string;
}

export interface CompiledMeta {
  compiledAt: string;
  dataVersion: {
    elementary: string;
    middle: string;
    high: string;
    bridges: string;
  };
  counts: Record<string, number>;
  exclusions: {
    highVocationalCourses: number;
    highVocationalTopics: number;
    noticeKo: string;
    keywords: string[];
  };
}
