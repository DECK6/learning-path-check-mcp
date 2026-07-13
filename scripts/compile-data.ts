import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Json = Record<string, any>;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const elementaryRoot = resolve(root, process.env.ELEMENTARY_DIR ?? "../korean-elementary-learning-map");
const secondaryRoot = resolve(root, process.env.SECONDARY_DIR ?? "../korean-secondary-learning-map");
const outputRoot = join(root, "src/data/compiled");

const readJson = async (path: string): Promise<Json> => JSON.parse(await readFile(path, "utf8"));
const unique = <T>(values: T[]): T[] => [...new Set(values)];
const trim = (value: unknown, length = 200): string => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, length);
const hash = (value: string, length = 20): string => createHash("sha256").update(value).digest("hex").slice(0, length);
const normalizeCode = (value: string): string => value.normalize("NFKC").replace(/\s+/g, "").trim();

function elementaryStandardCodes(topic: any): string[] {
  const candidates = [topic.sourceStandardCode, ...(topic.standards ?? [])].filter(Boolean).flatMap((value: unknown) => String(value).match(/\[[^\[\]]+\]/g) ?? []);
  return unique(candidates.map(normalizeCode)).sort();
}

function normalizeSearch(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^0-9a-z가-힣]+/g, " ").replace(/\s+/g, " ").trim();
}

function compactSearch(value: string): string {
  return normalizeSearch(value).replaceAll(" ", "");
}

async function writeJson(name: string, value: unknown, pretty = false): Promise<void> {
  await mkdir(outputRoot, { recursive: true });
  await writeFile(join(outputRoot, name), `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`, "utf8");
}

const [
  elementaryTopicsFile,
  elementaryDependenciesFile,
  elementaryManifest,
  middleRelease,
  middleCoursesFile,
  middleGroupsFile,
  middleDomainsFile,
  middleStandardsFile,
  middleTopicsFile,
  middleRelationsFile,
  highRelease,
  highCoursesFile,
  highGroupsFile,
  highDomainsFile,
  highStandardsFile,
  highTopicsFile,
  highRelationsFile,
  highCourseRelationsFile,
  bridgeRelease,
  transitionsFile,
  elementaryTransitionsFile,
] = await Promise.all([
  readJson(join(elementaryRoot, "data/kr/topics.json")),
  readJson(join(elementaryRoot, "data/kr/dependencies.json")),
  readJson(join(elementaryRoot, "data/kr/manifest.json")),
  readJson(join(secondaryRoot, "data/kr/middle/release.json")),
  readJson(join(secondaryRoot, "data/kr/middle/courses.json")),
  readJson(join(secondaryRoot, "data/kr/middle/subject-groups.json")),
  readJson(join(secondaryRoot, "data/kr/middle/domains.json")),
  readJson(join(secondaryRoot, "data/kr/middle/standards.json")),
  readJson(join(secondaryRoot, "data/kr/middle/topics.json")),
  readJson(join(secondaryRoot, "data/kr/middle/learning-relations.json")),
  readJson(join(secondaryRoot, "data/kr/high/release.json")),
  readJson(join(secondaryRoot, "data/kr/high/courses.json")),
  readJson(join(secondaryRoot, "data/kr/high/subject-groups.json")),
  readJson(join(secondaryRoot, "data/kr/high/domains.json")),
  readJson(join(secondaryRoot, "data/kr/high/standards.json")),
  readJson(join(secondaryRoot, "data/kr/high/topics.json")),
  readJson(join(secondaryRoot, "data/kr/high/learning-relations.json")),
  readJson(join(secondaryRoot, "data/kr/high/course-relations.json")),
  readJson(join(secondaryRoot, "data/kr/bridges/release.json")),
  readJson(join(secondaryRoot, "data/kr/bridges/transition-alignments.json")),
  readJson(join(secondaryRoot, "data/kr/bridges/elementary-transitions.json")),
]);

const middleCourses = middleCoursesFile.records as any[];
const middleGroups = new Map((middleGroupsFile.records as any[]).map((group) => [group.id, group]));
const middleDomains = new Map((middleDomainsFile.records as any[]).map((domain) => [domain.id, domain]));
const middleStandards = new Map((middleStandardsFile.records as any[]).map((standard) => [standard.id, standard]));
const middleCourseById = new Map(middleCourses.map((course) => [course.id, course]));

const allHighCourses = highCoursesFile.records as any[];
const highCourses = allHighCourses.filter((course) => course.programScopes?.includes("all-high-schools"));
const highCourseIds = new Set(highCourses.map((course) => course.id));
const highGroups = new Map((highGroupsFile.records as any[]).map((group) => [group.id, group]));
const highDomains = new Map((highDomainsFile.records as any[]).filter((domain) => highCourseIds.has(domain.courseId)).map((domain) => [domain.id, domain]));
const allHighStandards = highStandardsFile.records as any[];
const highStandardRows = allHighStandards.filter((standard) => highCourseIds.has(standard.courseId));
const highStandards = new Map(highStandardRows.map((standard) => [standard.id, standard]));
const highCourseById = new Map(highCourses.map((course) => [course.id, course]));

const concepts: any[] = [];
for (const topic of elementaryTopicsFile.topics as any[]) {
  concepts.push({
    id: topic.id,
    nodeKind: "topic",
    schoolLevel: "elementary",
    subjectKo: topic.subjectKorean,
    subjectGroupKo: topic.subjectKorean,
    domainKo: topic.domainKorean,
    gradeBand: topic.gradeBand,
    titleKo: trim(topic.titleKorean ?? topic.title ?? topic.name, 240),
    summary: trim(topic.description),
    standardCodes: elementaryStandardCodes(topic),
    topicType: String(topic.type ?? "").toLowerCase(),
    assessmentPrompt: trim(topic.assessmentPrompt, 500) || undefined,
    evidence: (topic.evidence ?? []).slice(0, 2).map((value: unknown) => trim(value, 500)),
    verificationStatus: topic.verificationStatus ?? "public-doc-derived",
    sourceRefs: unique(topic.sourceRefs ?? []).sort(),
  });
}

const elementarySubjects = unique((elementaryTopicsFile.topics as any[]).map((topic) => topic.subjectKorean)).sort((a, b) => a.localeCompare(b, "ko"));
const elementarySubjectNodeByLabel = new Map<string, string>();
for (const label of elementarySubjects) {
  const id = `lpc.course.elementary.${hash(label, 12)}`;
  elementarySubjectNodeByLabel.set(label, id);
  concepts.push({
    id,
    nodeKind: "course",
    schoolLevel: "elementary",
    subjectKo: label,
    subjectGroupKo: label,
    gradeBand: "1-6",
    titleKo: `초등 ${label}`,
    summary: `초등학교 ${label} 교육과정의 과정 수준 탐색 노드다.`,
    standardCodes: [],
    evidence: [],
    verificationStatus: "repository-authored",
    sourceRefs: [],
  });
}

function addCourseConcept(course: any, profile: "middle" | "high", groups: Map<string, any>): void {
  const group = groups.get(course.subjectGroupId);
  concepts.push({
    id: course.id,
    nodeKind: "course",
    schoolLevel: profile,
    subjectKo: course.labelKorean,
    subjectGroupKo: group?.labelKorean ?? course.labelKorean,
    courseId: course.id,
    gradeBand: profile === "middle" ? "7-9" : null,
    titleKo: course.labelKorean,
    summary: `${course.labelKorean} 교육과정 과목의 과정 수준 탐색 노드다.`,
    standardCodes: [],
    evidence: [],
    verificationStatus: course.verificationStatus,
    sourceRefs: unique(course.sourceRefs ?? []).sort(),
  });
}

for (const course of middleCourses) addCourseConcept(course, "middle", middleGroups);
for (const course of highCourses) addCourseConcept(course, "high", highGroups);

function addSecondaryTopic(topic: any, profile: "middle" | "high", standards: Map<string, any>, domains: Map<string, any>, courses: Map<string, any>, groups: Map<string, any>): void {
  const alignedStandards = (topic.standardAlignments ?? []).map((alignment: any) => standards.get(alignment.standardId)).filter(Boolean);
  const course = courses.get(topic.courseIds?.[0]);
  const domain = domains.get(topic.domainId);
  concepts.push({
    id: topic.id,
    nodeKind: "topic",
    schoolLevel: profile,
    subjectKo: course?.labelKorean ?? "과목 미확인",
    subjectGroupKo: groups.get(course?.subjectGroupId)?.labelKorean ?? course?.labelKorean,
    courseId: course?.id,
    domainKo: domain?.labelKorean,
    gradeBand: profile === "middle" ? "7-9" : null,
    titleKo: trim(topic.labelKorean, 240),
    summary: trim(topic.description),
    standardCodes: unique(alignedStandards.map((standard: any) => normalizeCode(standard.code))).sort(),
    topicType: topic.types?.[0],
    assessmentPrompt: trim(topic.assessmentPrompts?.[0], 500) || undefined,
    evidence: (topic.evidence ?? []).slice(0, 2).map((value: unknown) => trim(value, 500)),
    verificationStatus: topic.verificationStatus,
    sourceRefs: unique(topic.sourceRefs ?? []).sort(),
  });
}

for (const topic of middleTopicsFile.records as any[]) addSecondaryTopic(topic, "middle", middleStandards, middleDomains, middleCourseById, middleGroups);
const includedHighTopics = (highTopicsFile.records as any[]).filter((topic) => topic.courseIds?.some((id: string) => highCourseIds.has(id)));
for (const topic of includedHighTopics) addSecondaryTopic(topic, "high", highStandards, highDomains, highCourseById, highGroups);

concepts.sort((a, b) => a.id.localeCompare(b.id, "en"));
const conceptIds = new Set(concepts.map((concept) => concept.id));
if (conceptIds.size !== concepts.length) throw new Error(`duplicate concept ids: ${concepts.length - conceptIds.size}`);
for (const concept of concepts) {
  if (concept.nodeKind === "topic" && concept.standardCodes.length === 0) throw new Error(`topic has no curriculum standard code: ${concept.id}`);
  if (concept.nodeKind === "topic" && concept.schoolLevel !== "elementary" && !concept.courseId) throw new Error(`secondary topic has no included course: ${concept.id}`);
}
const edges: any[] = [];

for (const dependency of elementaryDependenciesFile.dependencies as any[]) {
  edges.push({
    id: `lpc.edge.elementary.${hash(`${dependency.prerequisiteId}|${dependency.topicId}|${dependency.strength}`)}`,
    from: dependency.prerequisiteId,
    to: dependency.topicId,
    kind: "prerequisite",
    relationKind: dependency.strength === "hard" ? "required-prerequisite" : "recommended-before",
    strength: dependency.strength,
    scope: "same-school-level",
    reason: trim(dependency.reason, 500),
    basis: dependency.basis,
    basisKind: "repository-authored",
    reviewStatus: "internal-reviewed",
    sourceRefs: dependency.source ? [dependency.source] : [],
  });
}

function addLearningRelations(rows: any[]): void {
  for (const relation of rows) {
    if (!conceptIds.has(relation.prerequisiteTopicId) || !conceptIds.has(relation.dependentTopicId)) continue;
    edges.push({
      id: relation.id,
      from: relation.prerequisiteTopicId,
      to: relation.dependentTopicId,
      kind: "prerequisite",
      relationKind: relation.relationKind,
      strength: relation.strength,
      scope: relation.scope,
      reason: trim(relation.reason, 500),
      basis: relation.basis,
      basisKind: relation.basisKind,
      reviewStatus: relation.reviewStatus,
      sourceRefs: unique(relation.sourceRefs ?? []).sort(),
    });
  }
}

addLearningRelations(middleRelationsFile.records as any[]);
addLearningRelations(highRelationsFile.records as any[]);

for (const relation of highCourseRelationsFile.records as any[]) {
  if (!conceptIds.has(relation.fromCourseId) || !conceptIds.has(relation.toCourseId)) continue;
  edges.push({
    id: relation.id,
    from: relation.fromCourseId,
    to: relation.toCourseId,
    kind: "course-relation",
    relationKind: relation.relationKind,
    reason: trim(relation.reason, 500),
    basis: relation.basis,
    basisKind: relation.basisKind,
    reviewStatus: relation.reviewStatus,
    sourceRefs: unique(relation.sourceRefs ?? []).sort(),
  });
}

for (const transition of transitionsFile.records as any[]) {
  const fromIds = transition.fromTopicIds?.length ? transition.fromTopicIds : transition.fromCourseIds;
  const toIds = transition.toTopicIds?.length ? transition.toTopicIds : transition.toCourseIds;
  for (const from of fromIds) for (const to of toIds) {
    if (!conceptIds.has(from) || !conceptIds.has(to)) continue;
    edges.push({
      id: fromIds.length * toIds.length === 1 ? transition.id : `${transition.id}.${hash(`${from}|${to}`, 8)}`,
      from,
      to,
      kind: "transition",
      relationKind: transition.transitionKind,
      scope: "cross-school-level",
      reason: trim(transition.reason, 500),
      basis: transition.basis,
      basisKind: transition.basisKind,
      reviewStatus: transition.reviewStatus,
      sourceRefs: unique(transition.sourceRefs ?? []).sort(),
    });
  }
}

for (const transition of elementaryTransitionsFile.records as any[]) {
  edges.push({
    id: transition.id,
    from: transition.prerequisiteTopicId,
    to: transition.dependentTopicId,
    kind: "prerequisite",
    relationKind: transition.relationKind,
    strength: transition.strength,
    scope: transition.scope,
    reason: trim(transition.reason, 500),
    basis: transition.basis,
    basisKind: transition.basisKind,
    reviewStatus: transition.reviewStatus,
    sourceRefs: unique(transition.sourceRefs ?? []).sort(),
  });
}

const subjectContinuation: Record<string, string[]> = {
  "과학": ["과학"],
  "국어": ["국어"],
  "도덕": ["도덕"],
  "미술": ["미술"],
  "사회": ["사회"],
  "수학": ["수학"],
  "실과(기술·가정)/정보": ["기술·가정", "정보"],
  "영어": ["영어"],
  "음악": ["음악"],
  "체육": ["체육"],
};
for (const [elementaryLabel, middleLabels] of Object.entries(subjectContinuation)) {
  const from = elementarySubjectNodeByLabel.get(elementaryLabel);
  if (!from) throw new Error(`elementary subject node missing: ${elementaryLabel}`);
  for (const middleLabel of middleLabels) {
    const matches = middleCourses.filter((course) => course.labelKorean === middleLabel);
    if (matches.length !== 1) throw new Error(`middle continuation target ${middleLabel} resolved to ${matches.length}`);
    edges.push({
      id: `lpc.edge.subject-continuation.${hash(`${from}|${matches[0].id}`)}`,
      from,
      to: matches[0].id,
      kind: "subject-continuation",
      relationKind: "continues",
      scope: "cross-school-level",
      reason: `초등 ${elementaryLabel}에서 중학교 ${middleLabel}로 이어지는 과정 수준 교과 연결이다. 선수관계나 공식 이수 조건을 뜻하지 않는다.`,
      basis: "repository-authored-continuation-v1",
      basisKind: "repository-authored",
      reviewStatus: "internal-reviewed",
      sourceRefs: [],
    });
  }
}

edges.sort((a, b) => a.id.localeCompare(b.id, "en"));
const edgeIds = new Set<string>();
for (const edge of edges) {
  if (edgeIds.has(edge.id)) throw new Error(`duplicate edge id: ${edge.id}`);
  edgeIds.add(edge.id);
  if (!conceptIds.has(edge.from)) throw new Error(`edge ${edge.id} has unknown from endpoint ${edge.from}`);
  if (!conceptIds.has(edge.to)) throw new Error(`edge ${edge.id} has unknown to endpoint ${edge.to}`);
  if (edge.from === edge.to) throw new Error(`edge ${edge.id} is a self-cycle`);
}

const searchIndex = concepts.map((concept) => {
  const parts = [concept.titleKo, concept.subjectKo, concept.subjectGroupKo, concept.domainKo, ...concept.standardCodes].filter(Boolean).map(String);
  const text = normalizeSearch(parts.join(" "));
  return { id: concept.id, compact: compactSearch(text) };
});

const highTopicIds = new Set(includedHighTopics.map((topic) => topic.id));
const counts = {
  concepts: concepts.length,
  topicConcepts: concepts.filter((concept) => concept.nodeKind === "topic").length,
  courseConcepts: concepts.filter((concept) => concept.nodeKind === "course").length,
  elementaryTopics: (elementaryTopicsFile.topics as any[]).length,
  middleTopics: (middleTopicsFile.records as any[]).length,
  highAcademicTopics: highTopicIds.size,
  edges: edges.length,
  elementaryPrerequisites: (elementaryDependenciesFile.dependencies as any[]).length,
  middlePrerequisites: edges.filter((edge) => edge.kind === "prerequisite" && edge.from.startsWith("kr.topic.2022.middle") && edge.to.startsWith("kr.topic.2022.middle")).length,
  highAcademicPrerequisites: edges.filter((edge) => edge.kind === "prerequisite" && edge.from.startsWith("kr.topic.2022.high") && edge.to.startsWith("kr.topic.2022.high")).length,
  crossSchoolPrerequisites: (elementaryTransitionsFile.records as any[]).length,
  transitions: edges.filter((edge) => edge.kind === "transition").length,
  courseRelations: edges.filter((edge) => edge.kind === "course-relation").length,
  subjectContinuations: edges.filter((edge) => edge.kind === "subject-continuation").length,
};

const compiledDate = String(middleRelease.createdDate ?? "2026-07-13");
const meta = {
  compiledAt: `${compiledDate}T00:00:00.000Z`,
  dataVersion: {
    elementary: elementaryTopicsFile.version ?? elementaryManifest.taxonomyVersion,
    middle: middleRelease.releaseId,
    high: highRelease.releaseId,
    bridges: bridgeRelease.releaseId,
  },
  counts,
  exclusions: {
    highVocationalCourses: allHighCourses.length - highCourses.length,
    highVocationalTopics: (highTopicsFile.records as any[]).length - includedHighTopics.length,
    noticeKo: "P0는 고등학교 공통·일반·진로·융합 선택 및 교양·계열 과목을 지원하며 직업계 전문교과는 제외합니다.",
    keywords: ["간호", "조리", "용접", "미용", "제과", "제빵", "자동차 정비", "기계 가공", "전기 설비", "수산", "해운"],
  },
};

await writeJson("concepts.json", concepts);
await writeJson("edges.json", edges);
await writeJson("search-index.json", searchIndex);
await writeJson("meta.json", meta, true);

const totalBytes = (await Promise.all(["concepts.json", "edges.json", "search-index.json", "meta.json"].map(async (name) => (await readFile(join(outputRoot, name))).byteLength))).reduce((sum, bytes) => sum + bytes, 0);
if (totalBytes > 15 * 1024 * 1024) throw new Error(`compiled data exceeds 15 MiB: ${totalBytes} bytes`);
console.log(`data compile passed: ${concepts.length} concepts, ${edges.length} edges, ${totalBytes} bytes`);
