import { beforeEach, describe, expect, test } from "bun:test";
import { concepts, edges } from "../src/domain/data.js";
import { containsForbiddenLearningTerms, sanitizeLearningTerms } from "../src/presenters/terms.js";
import { currentScopeKey, runWithRequestHeaders } from "../src/identity.js";
import type { McpToolResult, ToolDefinition } from "../src/lib/types.js";
import { assessLearningCheckTool } from "../src/public-tools/assess-learning-check.js";
import { buildReviewPlanTool } from "../src/public-tools/build-review-plan.js";
import { createLearningCheckTool } from "../src/public-tools/create-learning-check.js";
import { getCurriculumOverviewTool } from "../src/public-tools/get-curriculum-overview.js";
import { getParentLearningReportTool } from "../src/public-tools/get-parent-learning-report.js";
import { getUpcomingLearningActionsTool } from "../src/public-tools/get-upcoming-learning-actions.js";
import { manageChildProfileTool } from "../src/public-tools/manage-child-profile.js";
import { assertNoObviousPii, PUBLIC_TOOLS, TOOL_ANNOTATIONS } from "../src/public-tools/registry.js";
import { recordLearningProgressTool } from "../src/public-tools/record-learning-progress.js";
import { searchCurriculumTool } from "../src/public-tools/search-curriculum.js";
import { traceLearningPathTool } from "../src/public-tools/trace-learning-path.js";
import { MemoryStore } from "../src/store/memory-store.js";
import { setUserStoreForTests } from "../src/store/store.js";

const TARGET = "kr.mt.math.number-operations.g5-6.s6-01-09.application";

const TEST_SALT = "tools-test-salt-that-is-at-least-32-bytes";
process.env.USER_SCOPE_SALT = TEST_SALT;

async function call(tool: ToolDefinition, input: unknown, user = "guardian-a"): Promise<McpToolResult> {
  return await runWithRequestHeaders({ "x-playmcp-user-id": user }, () => Promise.resolve(tool.handler(input)));
}

async function callPublic(tool: ToolDefinition, input: unknown): Promise<McpToolResult> {
  return await runWithRequestHeaders({}, () => Promise.resolve(tool.handler(input)));
}

const body = (result: McpToolResult) => result.structuredContent as any;

describe("public learning tools", () => {
  beforeEach(() => setUserStoreForTests(new MemoryStore()));

  test("registry exposes exactly ten correctly annotated tools", () => {
    expect(PUBLIC_TOOLS.map((tool) => tool.name)).toEqual([
      "manage_child_profile", "search_curriculum", "get_curriculum_overview", "trace_learning_path", "create_learning_check",
      "assess_learning_check", "build_review_plan", "record_learning_progress", "get_upcoming_learning_actions", "get_parent_learning_report",
    ]);
    expect(PUBLIC_TOOLS).toHaveLength(10);
    for (const tool of PUBLIC_TOOLS) expect(TOOL_ANNOTATIONS[tool.name].openWorldHint).toBe(false);
    expect(TOOL_ANNOTATIONS.manage_child_profile.destructiveHint).toBe(true);
    for (const tool of PUBLIC_TOOLS.filter((candidate) => candidate.name !== "manage_child_profile")) {
      expect(TOOL_ANNOTATIONS[tool.name].destructiveHint).toBe(false);
    }
    expect(TOOL_ANNOTATIONS.search_curriculum.readOnlyHint).toBe(true);
    expect(TOOL_ANNOTATIONS.assess_learning_check.readOnlyHint).toBe(false);
    expect(PUBLIC_TOOLS.every((tool) => tool.description.includes("Learning Path Check(우리 아이 뭐 배우지? 체크)"))).toBe(true);
    const authenticatedTools = new Set(["manage_child_profile", "create_learning_check", "assess_learning_check", "build_review_plan", "record_learning_progress", "get_upcoming_learning_actions", "get_parent_learning_report"]);
    expect(PUBLIC_TOOLS.filter((tool) => authenticatedTools.has(tool.name)).every((tool) => tool.description.includes("Requires an authenticated PlayMCP user"))).toBe(true);
    const sanitized = sanitizeLearningTerms("아이는 이 개념을 모릅니다. 학습부진입니다. 학년 수준에 미달합니다.");
    expect(containsForbiddenLearningTerms(sanitized)).toBe(false);
  });

  test("search handles natural terms, ambiguity, missing data, and vocational scope", async () => {
    const found = await call(searchCurriculumTool, { query: "분수 나눗셈", schoolLevel: "elementary", subject: "수학", limit: 5 });
    const repeated = await call(searchCurriculumTool, { query: "분수 나눗셈", schoolLevel: "elementary", subject: "수학", limit: 5 });
    expect(body(found).status).toBe("ok");
    expect(body(found)).toEqual(body(repeated));
    expect(body(found).ambiguous).toBe(true);
    expect(body(found).results[0].standardCodes).toContain("[6수01-09]");
    expect(found.content[0].text).toContain(body(found).results[0].conceptId);
    expect(body(await call(searchCurriculumTool, { query: "존재하지않는교육과정검색어xyz" })).status).toBe("not_found");
    expect(body(await call(searchCurriculumTool, { query: "용접 실무" })).status).toBe("out_of_scope");
    const natural = body(await call(searchCurriculumTool, { query: "초5 아이가 분수 나눗셈을 어려워해요", schoolLevel: "elementary", grade: 5, subject: "수학" }));
    expect(natural.status).toBe("ok");
    expect(natural.results[0].title).toContain("분수의 곱셈과 나눗셈");
    const functionSearch = body(await call(searchCurriculumTool, { query: "함수를 배우기 전에", schoolLevel: "middle", subject: "수학" }));
    expect(functionSearch.status).toBe("ok");
    expect(functionSearch.results.every((result: any) => `${result.title}${result.domain}`.includes("함수"))).toBe(true);
  });

  test("profile-to-report flow is continuous, deterministic, and ID-complete", async () => {
    const created = await call(manageChildProfileTool, { action: "create", nickname: "첫째", schoolLevel: "elementary", grade: 5, interestedSubjects: ["수학"], minutesPerDay: 15, guardianConsent: true });
    const childId = body(created).childId as string;
    expect(created.content[0].text).toContain(childId);
    expect(body(created).profile.guardianConsent).toMatchObject({ version: "v1" });
    expect(body(created).profile.guardianConsent.grantedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const updated = await call(manageChildProfileTool, { action: "update", childId, nickname: "첫째-수학", learningGoals: ["분수 단원 확인"], minutesPerDay: 20 });
    expect(body(updated).profile).toMatchObject({ id: childId, nickname: "첫째-수학", minutesPerDay: 20 });
    expect(body(updated).profile.guardianConsent).toEqual(body(created).profile.guardianConsent);
    const read = await call(manageChildProfileTool, { action: "read", childId });
    expect(body(read).profile.learningGoals).toEqual(["분수 단원 확인"]);
    expect(read.content[0].text).toContain("생성 시각:");
    expect(read.content[0].text).toContain("수정 시각:");

    const traceA = await call(traceLearningPathTool, { conceptId: TARGET, maxDepth: 6 });
    const traceB = await call(traceLearningPathTool, { conceptId: TARGET, maxDepth: 6 });
    expect(body(traceA)).toEqual(body(traceB));
    expect(body(traceA).prerequisites.length).toBeGreaterThanOrEqual(2);
    expect(traceA.content[0].text).toContain(TARGET);

    const checkResult = await call(createLearningCheckTool, { childId, conceptId: TARGET, itemCount: 3, createdAt: "2026-06-20T00:00:00Z" });
    const check = body(checkResult);
    expect(checkResult.content[0].text).toContain(check.checkId);
    expect(checkResult.content[0].text).toContain("데이터 버전:");
    for (const question of check.questions) expect(checkResult.content[0].text).toContain(question.id);
    expect(check.questions.every((question: any) => question.questionId === question.id)).toBe(true);

    const firstAssessment = await call(assessLearningCheckTool, {
      childId,
      checkId: check.checkId,
      responses: [
        { questionId: check.questions[0].id, outcome: "partial", response: "가".repeat(250) },
        { questionId: check.questions[1].id, outcome: "ok", response: "설명함" },
      ],
      assessedAt: "2026-06-20T12:00:00Z",
    });
    const assessed = body(firstAssessment);
    expect(assessed.results.map((row: any) => row.status)).toEqual(["review_needed", "understood", "needs_more_info"]);
    expect(assessed.results[0].response).toHaveLength(200);
    expect(assessed.firstReview.conceptId).toBe(check.questions[0].conceptId);
    expect(assessed.recommendedRecheckDate).toBe("2026-06-27");
    expect(firstAssessment.content[0].text).toContain(assessed.firstReview.conceptId);
    for (const row of assessed.results) {
      expect(firstAssessment.content[0].text).toContain(row.id);
      expect(firstAssessment.content[0].text).toContain(row.questionId);
    }

    const overview = await call(getCurriculumOverviewTool, { schoolLevel: "elementary", grade: 5, subject: "수학", childId, limit: 100 });
    const repeatedOverview = await call(getCurriculumOverviewTool, { schoolLevel: "elementary", grade: 5, subject: "수학", childId, limit: 100 });
    expect(body(overview)).toEqual(body(repeatedOverview));
    expect(body(overview).topics.some((topic: any) => topic.currentStatus !== "not_checked")).toBe(true);
    expect(overview.content[0].text).toContain(childId);

    const planResult = await call(buildReviewPlanTool, { childId, targetConceptId: TARGET, durationWeeks: 1, startDate: "2026-07-14", createdAt: "2026-07-14T13:00:00Z" });
    const plan = body(planResult);
    expect(plan.activities).toHaveLength(7);
    expect(plan.calendarEvents).toHaveLength(8);
    expect(plan.targetRetryDate).toBe("2026-07-21");
    expect(planResult.content[0].text).toContain(plan.planId);
    expect(planResult.content[0].text).toContain(plan.activities[0].activityId);

    const progressResult = await call(recordLearningProgressTool, { childId, planId: plan.planId, conceptId: plan.activities[0].conceptId, activityId: plan.activities[0].activityId, status: "completed", observation: "스스로 설명함", recordedAt: "2026-07-14T15:00:00Z" });
    const progress = body(progressResult);
    expect(progressResult.content[0].text).toContain(progress.progressId);
    expect(progressResult.content[0].text).toContain(plan.planId);

    const upcomingResult = await call(getUpcomingLearningActionsTool, { childId, asOf: "2026-07-18", daysAhead: 30 });
    const upcoming = body(upcomingResult);
    expect(upcoming.actions.some((action: any) => action.activityId === plan.activities[0].activityId)).toBe(false);
    expect(upcoming.actions.some((action: any) => action.kind === "recheck")).toBe(true);
    expect(upcoming.actions.some((action: any) => action.kind === "recheck" && action.planId === plan.planId)).toBe(true);
    expect(upcoming.groups.overdue.some((action: any) => action.kind === "review_activity")).toBe(true);
    expect(upcoming.groups.today.some((action: any) => action.kind === "review_activity")).toBe(true);
    for (const action of upcoming.actions) expect(upcomingResult.content[0].text).toContain(action.conceptId);

    const secondCheck = body(await call(createLearningCheckTool, { childId, conceptId: TARGET, itemCount: 3, createdAt: "2026-07-20T00:00:00Z" }));
    const secondAssessment = body(await call(assessLearningCheckTool, {
      childId,
      checkId: secondCheck.checkId,
      responses: secondCheck.questions.map((question: any) => ({ questionId: question.id, outcome: "ok" })),
      assessedAt: "2026-07-20T12:00:00Z",
    }));
    expect(secondAssessment.results.some((row: any) => row.delta === "improved")).toBe(true);

    const reportResult = await call(getParentLearningReportTool, { childId, period: "monthly", from: "2026-07-01", to: "2026-07-31" });
    const report = body(reportResult);
    expect(report.summary.completedActivities).toBe(1);
    expect(report.summary.understood).toBeGreaterThanOrEqual(1);
    expect(report.changeSummary).not.toContain("이전 기간 점검 기록이 없어");
    expect(reportResult.content[0].text).toContain(progress.progressId);
    expect(reportResult.content[0].text).toContain(childId);
    expect(reportResult.content[0].text).toContain(secondCheck.checkId);
    for (const record of report.statusRecords) expect(reportResult.content[0].text).toContain(record.statusId);
    expect(containsForbiddenLearningTerms(reportResult.content[0].text)).toBe(false);

    await expect(call(recordLearningProgressTool, { childId, planId: plan.planId, conceptId: plan.activities[0].conceptId, status: "completed" })).rejects.toThrow("activityId가 필요");
    const targetRecheck = await call(recordLearningProgressTool, { childId, planId: plan.planId, conceptId: plan.targetConceptId, status: "planned" });
    expect(body(targetRecheck).progress.activityId).toBeUndefined();

    await expect(call(manageChildProfileTool, { action: "delete", childId })).rejects.toThrow("확인이 필요합니다");
    const deleted = await call(manageChildProfileTool, { action: "delete", childId, confirmDelete: true });
    expect(body(deleted).deleted).toMatchObject({ children: 1, checks: 2, plans: 1, progress: 2 });
  });

  test("user scope does not reveal another guardian's child", async () => {
    const created = await call(manageChildProfileTool, { action: "create", nickname: "둘째", schoolLevel: "middle", grade: 2, guardianConsent: true }, "guardian-a");
    const childId = body(created).childId;
    await expect(call(manageChildProfileTool, { action: "read", childId }, "guardian-b")).rejects.toThrow("자녀 프로필을 찾을 수 없습니다");
  });

  test("anonymous users can search but cannot create or read profiles", async () => {
    const search = await callPublic(searchCurriculumTool, { query: "분수 나눗셈", schoolLevel: "elementary" });
    expect(body(search).status).toBe("ok");
    await expect(callPublic(manageChildProfileTool, { action: "create", nickname: "공개 스코프", schoolLevel: "elementary", grade: 3, guardianConsent: true })).rejects.toThrow("로그인한 PlayMCP 사용자");
    await expect(callPublic(manageChildProfileTool, { action: "read" })).rejects.toThrow("로그인한 PlayMCP 사용자");
  });

  test("profile create requires consent and obvious PII is rejected", async () => {
    await expect(call(manageChildProfileTool, { action: "create", nickname: "첫째", schoolLevel: "elementary", grade: 5 })).rejects.toThrow("보호자 동의");
    expect(() => assertNoObviousPii({ nickname: "parent@example.com" })).toThrow("개인정보처럼 보이는 내용");
    expect(() => assertNoObviousPii({ observation: "010-1234-5678" })).toThrow("개인정보처럼 보이는 내용");
    expect(() => assertNoObviousPii({ response: "900101-1234567" })).toThrow("개인정보처럼 보이는 내용");
    expect(() => assertNoObviousPii({ observation: "4111 1111 1111 1111" })).toThrow("개인정보처럼 보이는 내용");
    expect(() => assertNoObviousPii({ query: "분수 나눗셈" })).not.toThrow();
    expect(() => assertNoObviousPii({ recordedAt: "1752345678901" })).not.toThrow();
    expect(() => assertNoObviousPii({ observation: "100-110, 112-120쪽 복습" })).not.toThrow();
    expect(() => assertNoObviousPii({ learningGoals: ["ISBN 978-89-1234-567-8 교재 단원 복습"] })).not.toThrow();
  });

  test("legacy profiles require explicit re-consent without crashing reads", async () => {
    const store = new MemoryStore();
    setUserStoreForTests(store);
    const scopeKey = runWithRequestHeaders({ "x-playmcp-user-id": "legacy-guardian" }, currentScopeKey);
    await store.upsertChild(scopeKey, {
      id: "child-legacy",
      nickname: "기존 프로필",
      schoolLevel: "elementary",
      grade: 5,
      interestedSubjects: [],
      learningGoals: [],
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    const read = await call(manageChildProfileTool, { action: "read", childId: "child-legacy" }, "legacy-guardian");
    expect(body(read).consentRequired).toBe(true);
    expect(read.content[0].text).toContain("재동의 필요");
    await expect(call(createLearningCheckTool, { childId: "child-legacy", conceptId: TARGET }, "legacy-guardian")).rejects.toThrow("동의 기록이 없습니다");
    await expect(call(manageChildProfileTool, { action: "update", childId: "child-legacy", nickname: "수정" }, "legacy-guardian")).rejects.toThrow("guardianConsent=true");
    const updated = await call(manageChildProfileTool, { action: "update", childId: "child-legacy", guardianConsent: true }, "legacy-guardian");
    expect(body(updated).profile.guardianConsent).toMatchObject({ version: "v1" });
  });

  test("middle and high concept graphs are compiled while vocational courses stay excluded", async () => {
    const middleDependents = new Set(edges.filter((edge) => edge.kind === "prerequisite" && edge.to.startsWith("kr.topic.2022.middle")).map((edge) => edge.to));
    const middleTarget = concepts.find((concept) => concept.schoolLevel === "middle" && concept.nodeKind === "topic" && middleDependents.has(concept.id));
    expect(middleTarget).toBeDefined();
    const traced = await call(traceLearningPathTool, { conceptId: middleTarget?.id, maxDepth: 2 });
    expect(body(traced).target.schoolLevel).toBe("middle");
    expect(body(traced).prerequisites.length).toBeGreaterThan(0);
    expect(body(traced).semanticsNotice).toContain("recommended-before");
    expect(JSON.stringify(body(traced))).not.toContain("직업계 전문교과");
    const overview = await call(getCurriculumOverviewTool, { schoolLevel: "middle", grade: 2, subject: middleTarget?.subjectKo ?? "수학", limit: 5 });
    expect(body(overview).status).toBe("ok");
    expect(body(overview).topics).toHaveLength(5);
    const highDependents = new Set(edges.filter((edge) => edge.kind === "prerequisite" && edge.to.startsWith("kr.topic.2022.high")).map((edge) => edge.to));
    const highTarget = concepts.find((concept) => concept.schoolLevel === "high" && concept.nodeKind === "topic" && highDependents.has(concept.id));
    const highTrace = await call(traceLearningPathTool, { conceptId: highTarget?.id, maxDepth: 2 });
    expect(body(highTrace).target.schoolLevel).toBe("high");
    expect(body(highTrace).prerequisites.length).toBeGreaterThan(0);
    expect(highTrace.content[0].text).toContain("근거:");
  });

  test("a reviewed elementary fraction bridge reaches middle and high concepts", async () => {
    const bridgeSource = "kr.mt.math.number-operations.g5-6.s6-01-11.application";
    const traced = await call(traceLearningPathTool, { conceptId: bridgeSource, maxDepth: 6 });
    const levels = new Set([...body(traced).successors, ...body(traced).transitions].map((step: any) => step.concept.schoolLevel));
    expect(levels.has("middle")).toBe(true);
    expect(levels.has("high")).toBe(true);
  });
});
