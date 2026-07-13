import { DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT } from "../config/limits.js";
import type { CompiledConcept, SchoolLevel } from "../lib/types.js";
import { compiledMeta, searchIndex } from "./data.js";
import { learningGraph } from "./graph.js";

export interface CurriculumSearchOptions {
  query: string;
  schoolLevel?: SchoolLevel;
  subject?: string;
  grade?: number;
  limit?: number;
}

export interface CurriculumSearchMatch {
  concept: CompiledConcept;
  score: number;
  matchReason: string;
}

export interface CurriculumSearchResult {
  matches: CurriculumSearchMatch[];
  ambiguous: boolean;
  outOfScope: boolean;
  scopeNotice?: string;
}

export function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
}

const STOP_TERMS = new Set(["아이", "학생", "학습", "개념", "내용", "단원", "무엇", "뭐", "어떤", "먼저", "전에", "필요", "필요한", "배우기", "배우다", "알아야", "설명", "알려줘", "알려주세요"]);
const PARTICLES = ["으로부터", "에서부터", "에게서", "에서는", "으로", "에서", "부터", "까지", "보다", "에게", "한테", "처럼", "만큼", "하고", "이며", "의", "은", "는", "이", "가", "을", "를", "에", "로", "와", "과", "도", "만"];

function searchTerms(value: string): string[] {
  const raw = value.normalize("NFKC").toLowerCase().split(/[^0-9a-z가-힣]+/g).filter(Boolean);
  const values: string[] = [];
  for (const item of raw) {
    const possessiveParts = item.includes("의") && item.split("의").every((part) => part.length >= 2) ? item.split("의") : [item];
    for (const part of possessiveParts) {
      let term = normalizeSearch(part);
      for (const particle of PARTICLES) {
        if (term.endsWith(particle) && term.length - particle.length >= 2) {
          term = term.slice(0, -particle.length);
          break;
        }
      }
      if (term.length < 2 || STOP_TERMS.has(term) || /^(초|중|고)\d$/.test(term) || /^(배우|어려|궁금|알려)/.test(term)) continue;
      values.push(term);
    }
  }
  return [...new Set(values)];
}

function gradeMatches(concept: CompiledConcept, grade: number): boolean {
  if (concept.schoolLevel === "middle" || concept.schoolLevel === "high") return grade >= 1 && grade <= 3;
  if (!concept.gradeBand) return true;
  const values = concept.gradeBand.match(/\d+/g)?.map(Number) ?? [];
  if (values.length === 1) return values[0] === grade;
  if (values.length >= 2) return grade >= values[0] && grade <= values[1];
  return true;
}

function score(indexText: string, concept: CompiledConcept, query: string, terms: string[]): CurriculumSearchMatch | null {
  const codes = concept.standardCodes.map(normalizeSearch);
  const title = normalizeSearch(concept.titleKo);
  const subject = normalizeSearch(concept.subjectKo);
  const domain = normalizeSearch(concept.domainKo ?? "");
  if (codes.includes(query)) return { concept, score: 120, matchReason: "성취기준 코드가 정확히 일치합니다." };
  if (title === query) return { concept, score: 110, matchReason: "개념 이름이 정확히 일치합니다." };
  if (subject === query && concept.nodeKind === "course") return { concept, score: 100, matchReason: "과목 이름이 정확히 일치합니다." };
  if (title.includes(query)) return { concept, score: 90 - Math.min(20, title.length - query.length), matchReason: "개념 이름에 검색어가 포함됩니다." };
  if (domain.includes(query)) return { concept, score: 75, matchReason: "교육과정 영역이 일치합니다." };
  if (subject.includes(query)) return { concept, score: concept.nodeKind === "course" ? 80 : 65, matchReason: "과목이 일치합니다." };
  if (indexText.includes(query)) return { concept, score: 55, matchReason: "개념·과목·영역·성취기준 검색어가 일치합니다." };
  const titleHits = terms.filter((term) => title.includes(term)).length;
  if (terms.length > 0 && titleHits === terms.length) return { concept, score: 75 + Math.min(15, titleHits * 3), matchReason: "검색 문장의 핵심 낱말이 개념 이름과 일치합니다." };
  const hits = terms.filter((term) => indexText.includes(term)).length;
  if (terms.length > 1 && hits === terms.length) return { concept, score: 65 + Math.min(15, hits * 3), matchReason: "검색어의 핵심 낱말이 모두 교육과정 표기와 일치합니다." };
  if (hits > 0) return { concept, score: 30 + Math.min(20, hits * 5), matchReason: "검색어 일부가 교육과정 표기와 일치합니다." };
  return null;
}

export function searchCurriculum(options: CurriculumSearchOptions): CurriculumSearchResult {
  const query = normalizeSearch(options.query);
  const terms = searchTerms(options.query);
  if (!query) return { matches: [], ambiguous: false, outOfScope: false };
  const outOfScope = compiledMeta.exclusions.keywords.some((keyword) => query.includes(normalizeSearch(keyword)));
  if (outOfScope) return { matches: [], ambiguous: false, outOfScope: true, scopeNotice: compiledMeta.exclusions.noticeKo };
  if (options.schoolLevel && options.schoolLevel !== "elementary" && options.grade && options.grade > 3) throw new Error("중·고등학교 학년은 1~3 범위여야 합니다.");
  const subjectFilter = options.subject ? normalizeSearch(options.subject) : null;
  const limit = Math.min(MAX_SEARCH_LIMIT, Math.max(1, options.limit ?? DEFAULT_SEARCH_LIMIT));
  const matches: CurriculumSearchMatch[] = [];
  for (const record of searchIndex) {
    const concept = learningGraph.get(record.id);
    if (!concept) continue;
    if (options.schoolLevel && concept.schoolLevel !== options.schoolLevel) continue;
    if (subjectFilter && !normalizeSearch(`${concept.subjectKo}${concept.subjectGroupKo ?? ""}`).includes(subjectFilter)) continue;
    if (options.grade && !gradeMatches(concept, options.grade)) continue;
    const match = score(record.compact, concept, query, terms);
    if (match) matches.push(match);
  }
  matches.sort((a, b) => b.score - a.score || (a.concept.nodeKind === b.concept.nodeKind ? 0 : a.concept.nodeKind === "topic" ? -1 : 1) || a.concept.id.localeCompare(b.concept.id, "en"));
  const selected = matches.slice(0, limit);
  const ambiguous = selected.length > 1 && selected[0].score - selected[1].score <= 5;
  return { matches: selected, ambiguous, outOfScope: false };
}
