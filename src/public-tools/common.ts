import type { McpToolResult, CompiledConcept } from "../lib/types.js";
import { compiledMeta } from "../domain/data.js";
import { responseMeta } from "../config/version.js";
import { requireAuthenticatedScopeKey } from "../identity.js";
import { getUserStore } from "../store/store.js";
import type { ChildProfile } from "../store/types.js";
import { sanitizeLearningTerms } from "../presenters/terms.js";
import { isoDate } from "../lib/date.js";

export const PUBLIC_META = Object.freeze(responseMeta(compiledMeta.dataVersion));

export function toolResult(markdown: string, structured: Record<string, unknown>, isError = false): McpToolResult {
  const versions = compiledMeta.dataVersion;
  const footer = `---\n- 데이터 버전: 초등 ${versions.elementary} · 중학교 ${versions.middle} · 고등학교 ${versions.high} · 브리지 ${versions.bridges}\n- 안내: ${String(PUBLIC_META.disclaimer)}`;
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text", text: sanitizeLearningTerms(`${markdown.trim()}\n\n${footer}`) }],
    structuredContent: { ...structured, meta: PUBLIC_META },
  };
}

export function conceptView(concept: CompiledConcept): Record<string, unknown> {
  return {
    conceptId: concept.id,
    nodeKind: concept.nodeKind,
    title: concept.titleKo,
    schoolLevel: concept.schoolLevel,
    gradeBand: concept.gradeBand,
    subject: concept.subjectKo,
    subjectGroup: concept.subjectGroupKo,
    courseId: concept.courseId,
    domain: concept.domainKo,
    standardCodes: concept.standardCodes,
    verificationStatus: concept.verificationStatus,
    sourceRefs: concept.sourceRefs,
  };
}

export async function requireChild(childId: string): Promise<{ child: ChildProfile; scopeKey: string }> {
  const scopeKey = requireAuthenticatedScopeKey();
  const child = await getUserStore().getChild(scopeKey, childId);
  if (!child) throw new Error("자녀 프로필을 찾을 수 없습니다.");
  if (!child.guardianConsent) throw new Error("이 프로필은 보호자 저장 동의 기록이 없습니다. 프로필 관리에서 명시적 동의를 기록한 뒤 다시 시도해 주세요.");
  return { child, scopeKey };
}

export function timestamp(value?: string): string {
  if (!value) return new Date().toISOString();
  const date = new Date(value.length === 10 ? `${isoDate(value)}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) throw new Error("유효한 날짜와 시간을 입력해 주세요.");
  return date.toISOString();
}
