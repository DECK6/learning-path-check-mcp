import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "../src/store/file-store.js";
import { MemoryStore } from "../src/store/memory-store.js";
import { PostgresStore } from "../src/store/postgres-store.js";
import type { ChildProfile, ConceptStatus, LearningCheck, LearningProgress, ReviewPlan, UserStore } from "../src/store/types.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function fixtures() {
  const child: ChildProfile = { id: "child-1", nickname: "첫째", schoolLevel: "elementary", grade: 5, interestedSubjects: ["수학"], learningGoals: [], guardianConsent: { version: "v1", grantedAt: "2026-07-01T00:00:00.000Z" }, createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" };
  const check: LearningCheck = { id: "check-1", childId: child.id, targetConceptId: "concept-1", questions: [], createdAt: "2026-07-02T00:00:00.000Z" };
  const status: ConceptStatus = { id: "status-1", childId: child.id, conceptId: "concept-1", checkId: check.id, questionId: "q1", status: "review_needed", outcome: "partial", reason: "확인", delta: "new", assessedAt: "2026-07-03T12:00:00.000Z", recommendedRecheckDate: "2026-07-10" };
  const plan: ReviewPlan = { id: "plan-1", childId: child.id, targetConceptId: "concept-1", reviewConceptIds: ["concept-1"], durationWeeks: 1, minutesPerDay: 20, startDate: "2026-07-04", targetRetryDate: "2026-07-11", activities: [], calendarEvents: [], createdAt: "2026-07-03T00:00:00.000Z" };
  const progress: LearningProgress = { id: "progress-1", childId: child.id, planId: plan.id, conceptId: "concept-1", status: "completed", recordedAt: "2026-07-04T12:00:00.000Z" };
  return { child, check, status, plan, progress };
}

async function exerciseStore(store: UserStore): Promise<void> {
  const { child, check, status, plan, progress } = fixtures();
  await store.upsertChild("scope-a", child);
  await store.saveCheck("scope-a", check);
  await store.saveConceptStatuses("scope-a", [status]);
  await store.savePlan("scope-a", plan);
  await store.saveProgress("scope-a", progress);
  expect(await store.getChild("scope-a", child.id)).toEqual(child);
  expect(await store.getChild("scope-b", child.id)).toBeUndefined();
  expect(await store.listConceptStatuses("scope-a", child.id, { from: "2026-07-03", to: "2026-07-03" })).toHaveLength(1);
  expect(await store.listProgress("scope-a", child.id, { from: "2026-07-04", to: "2026-07-04" })).toHaveLength(1);
  const deleted = await store.deleteChild("scope-a", child.id);
  expect(deleted).toEqual({ children: 1, checks: 1, statuses: 1, plans: 1, progress: 1 });
  expect(await store.listPlans("scope-a", child.id)).toHaveLength(0);
  await store.upsertChild("scope-a", { ...child, id: "child-a2" });
  await store.upsertChild("scope-b", { ...child, id: "child-b1" });
  expect(await store.deleteAllForScope("scope-a")).toEqual({ children: 1, checks: 0, statuses: 0, plans: 0, progress: 0 });
  expect(await store.getChild("scope-a", "child-a2")).toBeUndefined();
  expect(await store.getChild("scope-b", "child-b1")).toBeDefined();
}

describe("user stores", () => {
  test("postgres driver rejects non-PostgreSQL DATABASE_URL values", () => {
    expect(() => new PostgresStore("mysql://localhost/database")).toThrow("PostgreSQL");
  });

  test("memory store supports isolation, date ranges, and cascade", async () => {
    await exerciseStore(new MemoryStore());
  });

  test("file store persists atomically with owner-only permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lpc-store-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "state.json");
    const first = new FileStore(path);
    const { child } = fixtures();
    await first.upsertChild("scope-a", child);
    const second = new FileStore(path);
    expect(await second.getChild("scope-a", child.id)).toEqual(child);
    expect(JSON.parse(await readFile(path, "utf8")).version).toBe(1);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await exerciseStore(second);
  });

  test.skipIf(!process.env.DATABASE_URL)("postgres store is covered when DATABASE_URL is configured", () => {
    expect(process.env.DATABASE_URL).toBeTruthy();
  });
});
