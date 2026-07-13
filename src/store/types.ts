import type { LearningStatus, StatusDelta } from "../domain/judgment.js";
import type { CalendarEventDraft, PlanActivityDraft } from "../domain/plan-builder.js";
import type { SchoolLevel } from "../lib/types.js";

export interface ChildProfile {
  id: string;
  nickname: string;
  schoolLevel: SchoolLevel;
  grade: number;
  interestedSubjects: string[];
  learningGoals: string[];
  minutesPerDay?: number;
  guardianConsent?: {
    version: "v1";
    grantedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CheckQuestion {
  id: string;
  conceptId: string;
  prompt: string;
  expectedElements: string[];
  criterion: string;
  depth: number;
  orderReason: string;
}

export interface LearningCheck {
  id: string;
  childId: string;
  targetConceptId: string;
  observedDifficulty?: string;
  questions: CheckQuestion[];
  createdAt: string;
}

export interface ConceptStatus {
  id: string;
  childId: string;
  conceptId: string;
  checkId: string;
  questionId: string;
  status: LearningStatus;
  outcome: "ok" | "partial" | "fail" | "unknown";
  response?: string;
  reason: string;
  delta: StatusDelta;
  assessedAt: string;
  recommendedRecheckDate: string;
}

export interface ReviewPlan {
  id: string;
  childId: string;
  targetConceptId: string;
  reviewConceptIds: string[];
  durationWeeks: number;
  minutesPerDay: number;
  startDate: string;
  targetRetryDate: string;
  activities: PlanActivityDraft[];
  calendarEvents: CalendarEventDraft[];
  createdAt: string;
}

export interface LearningProgress {
  id: string;
  childId: string;
  planId: string;
  conceptId: string;
  activityId?: string;
  status: "planned" | "in_progress" | "completed" | "skipped";
  observation?: string;
  recordedAt: string;
}

export interface DateRange {
  from?: string;
  to?: string;
}

export interface DeleteCounts {
  children: number;
  checks: number;
  statuses: number;
  plans: number;
  progress: number;
}

export interface UserStore {
  getChild(scopeKey: string, childId: string): Promise<ChildProfile | undefined>;
  listChildren(scopeKey: string): Promise<ChildProfile[]>;
  upsertChild(scopeKey: string, child: ChildProfile): Promise<ChildProfile>;
  deleteChild(scopeKey: string, childId: string): Promise<DeleteCounts>;
  saveCheck(scopeKey: string, check: LearningCheck): Promise<LearningCheck>;
  getCheck(scopeKey: string, checkId: string): Promise<LearningCheck | undefined>;
  saveConceptStatuses(scopeKey: string, statuses: ConceptStatus[]): Promise<ConceptStatus[]>;
  listConceptStatuses(scopeKey: string, childId: string, range?: DateRange): Promise<ConceptStatus[]>;
  savePlan(scopeKey: string, plan: ReviewPlan): Promise<ReviewPlan>;
  getPlan(scopeKey: string, planId: string): Promise<ReviewPlan | undefined>;
  listPlans(scopeKey: string, childId: string): Promise<ReviewPlan[]>;
  saveProgress(scopeKey: string, progress: LearningProgress): Promise<LearningProgress>;
  listProgress(scopeKey: string, childId: string, range?: DateRange): Promise<LearningProgress[]>;
  deleteAllForScope(scopeKey: string): Promise<DeleteCounts>;
}
