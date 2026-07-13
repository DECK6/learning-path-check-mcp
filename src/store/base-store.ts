import { MAX_SCOPE_COUNT } from "../config/limits.js";
import type { ChildProfile, ConceptStatus, DateRange, DeleteCounts, LearningCheck, LearningProgress, ReviewPlan, UserStore } from "./types.js";

export interface ScopeState {
  children: Record<string, ChildProfile>;
  checks: Record<string, LearningCheck>;
  statuses: Record<string, ConceptStatus>;
  plans: Record<string, ReviewPlan>;
  progress: Record<string, LearningProgress>;
}

const emptyState = (): ScopeState => ({ children: {}, checks: {}, statuses: {}, plans: {}, progress: {} });
const clone = <T>(value: T): T => structuredClone(value);

function inRange(date: string, range?: DateRange): boolean {
  const comparable = date.slice(0, 10);
  if (range?.from && comparable < range.from.slice(0, 10)) return false;
  if (range?.to && comparable > range.to.slice(0, 10)) return false;
  return true;
}

export abstract class BaseStore implements UserStore {
  protected readonly scopes = new Map<string, ScopeState>();

  protected async beforeAccess(): Promise<void> {}
  protected async afterMutation(): Promise<void> {}

  protected exportScopes(): Array<{ scopeKey: string; state: ScopeState }> {
    return [...this.scopes].map(([scopeKey, state]) => ({ scopeKey, state: clone(state) }));
  }

  protected importScopes(values: Array<{ scopeKey: string; state: ScopeState }>): void {
    this.scopes.clear();
    for (const value of values.slice(-MAX_SCOPE_COUNT)) this.scopes.set(value.scopeKey, clone(value.state));
  }

  private state(scopeKey: string, create = false): ScopeState | undefined {
    const existing = this.scopes.get(scopeKey);
    if (existing) {
      this.scopes.delete(scopeKey);
      this.scopes.set(scopeKey, existing);
      return existing;
    }
    if (!create) return undefined;
    const state = emptyState();
    this.scopes.set(scopeKey, state);
    while (this.scopes.size > MAX_SCOPE_COUNT) this.scopes.delete(this.scopes.keys().next().value as string);
    return state;
  }

  async getChild(scopeKey: string, childId: string): Promise<ChildProfile | undefined> {
    await this.beforeAccess();
    const child = this.state(scopeKey)?.children[childId];
    return child ? clone(child) : undefined;
  }

  async listChildren(scopeKey: string): Promise<ChildProfile[]> {
    await this.beforeAccess();
    return Object.values(this.state(scopeKey)?.children ?? {}).map(clone).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async upsertChild(scopeKey: string, child: ChildProfile): Promise<ChildProfile> {
    await this.beforeAccess();
    (this.state(scopeKey, true) as ScopeState).children[child.id] = clone(child);
    await this.afterMutation();
    return clone(child);
  }

  async deleteChild(scopeKey: string, childId: string): Promise<DeleteCounts> {
    await this.beforeAccess();
    const state = this.state(scopeKey);
    if (!state?.children[childId]) return { children: 0, checks: 0, statuses: 0, plans: 0, progress: 0 };
    delete state.children[childId];
    const counts: DeleteCounts = { children: 1, checks: 0, statuses: 0, plans: 0, progress: 0 };
    for (const [key, value] of Object.entries(state.checks)) if (value.childId === childId) { delete state.checks[key]; counts.checks += 1; }
    for (const [key, value] of Object.entries(state.statuses)) if (value.childId === childId) { delete state.statuses[key]; counts.statuses += 1; }
    for (const [key, value] of Object.entries(state.plans)) if (value.childId === childId) { delete state.plans[key]; counts.plans += 1; }
    for (const [key, value] of Object.entries(state.progress)) if (value.childId === childId) { delete state.progress[key]; counts.progress += 1; }
    await this.afterMutation();
    return counts;
  }

  async saveCheck(scopeKey: string, check: LearningCheck): Promise<LearningCheck> {
    await this.beforeAccess();
    (this.state(scopeKey, true) as ScopeState).checks[check.id] = clone(check);
    await this.afterMutation();
    return clone(check);
  }

  async getCheck(scopeKey: string, checkId: string): Promise<LearningCheck | undefined> {
    await this.beforeAccess();
    const check = this.state(scopeKey)?.checks[checkId];
    return check ? clone(check) : undefined;
  }

  async saveConceptStatuses(scopeKey: string, statuses: ConceptStatus[]): Promise<ConceptStatus[]> {
    await this.beforeAccess();
    const state = this.state(scopeKey, true) as ScopeState;
    for (const status of statuses) state.statuses[status.id] = clone(status);
    await this.afterMutation();
    return clone(statuses);
  }

  async listConceptStatuses(scopeKey: string, childId: string, range?: DateRange): Promise<ConceptStatus[]> {
    await this.beforeAccess();
    return Object.values(this.state(scopeKey)?.statuses ?? {})
      .filter((status) => status.childId === childId && inRange(status.assessedAt, range))
      .map(clone)
      .sort((a, b) => a.assessedAt.localeCompare(b.assessedAt) || a.id.localeCompare(b.id));
  }

  async savePlan(scopeKey: string, plan: ReviewPlan): Promise<ReviewPlan> {
    await this.beforeAccess();
    (this.state(scopeKey, true) as ScopeState).plans[plan.id] = clone(plan);
    await this.afterMutation();
    return clone(plan);
  }

  async getPlan(scopeKey: string, planId: string): Promise<ReviewPlan | undefined> {
    await this.beforeAccess();
    const plan = this.state(scopeKey)?.plans[planId];
    return plan ? clone(plan) : undefined;
  }

  async listPlans(scopeKey: string, childId: string): Promise<ReviewPlan[]> {
    await this.beforeAccess();
    return Object.values(this.state(scopeKey)?.plans ?? {}).filter((plan) => plan.childId === childId).map(clone).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async saveProgress(scopeKey: string, progress: LearningProgress): Promise<LearningProgress> {
    await this.beforeAccess();
    (this.state(scopeKey, true) as ScopeState).progress[progress.id] = clone(progress);
    await this.afterMutation();
    return clone(progress);
  }

  async listProgress(scopeKey: string, childId: string, range?: DateRange): Promise<LearningProgress[]> {
    await this.beforeAccess();
    return Object.values(this.state(scopeKey)?.progress ?? {})
      .filter((progress) => progress.childId === childId && inRange(progress.recordedAt, range))
      .map(clone)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id));
  }

  async deleteAllForScope(scopeKey: string): Promise<DeleteCounts> {
    await this.beforeAccess();
    const state = this.state(scopeKey);
    const counts = state ? {
      children: Object.keys(state.children).length,
      checks: Object.keys(state.checks).length,
      statuses: Object.keys(state.statuses).length,
      plans: Object.keys(state.plans).length,
      progress: Object.keys(state.progress).length,
    } : { children: 0, checks: 0, statuses: 0, plans: 0, progress: 0 };
    this.scopes.delete(scopeKey);
    await this.afterMutation();
    return counts;
  }
}
