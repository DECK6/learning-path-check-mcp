import type { ChildProfile, ConceptStatus, DateRange, DeleteCounts, LearningCheck, LearningProgress, ReviewPlan, UserStore } from "./types.js";

type Sql = any;

const clone = <T>(value: T): T => structuredClone(value);
const parseData = <T>(value: unknown): T => typeof value === "string" ? JSON.parse(value) as T : value as T;

export class PostgresStore implements UserStore {
  private readonly sql: Sql;
  private readonly ready: Promise<void>;

  constructor(url: string) {
    if (!/^postgres(?:ql)?:\/\//i.test(url)) throw new Error("DATABASE_URL은 PostgreSQL postgres:// 또는 postgresql:// 주소여야 합니다.");
    const SqlConstructor = (globalThis as any).Bun?.SQL;
    if (!SqlConstructor) throw new Error("Bun.SQL을 사용할 수 없습니다.");
    this.sql = new SqlConstructor(url);
    this.ready = this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.sql`CREATE TABLE IF NOT EXISTS lpc_children (scope_key text NOT NULL, id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (scope_key, id))`;
    await this.sql`CREATE TABLE IF NOT EXISTS lpc_checks (scope_key text NOT NULL, id text NOT NULL, child_id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (scope_key, id))`;
    await this.sql`CREATE TABLE IF NOT EXISTS lpc_statuses (scope_key text NOT NULL, id text NOT NULL, child_id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (scope_key, id))`;
    await this.sql`CREATE TABLE IF NOT EXISTS lpc_plans (scope_key text NOT NULL, id text NOT NULL, child_id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (scope_key, id))`;
    await this.sql`CREATE TABLE IF NOT EXISTS lpc_progress (scope_key text NOT NULL, id text NOT NULL, child_id text NOT NULL, data jsonb NOT NULL, PRIMARY KEY (scope_key, id))`;
    await this.sql`CREATE INDEX IF NOT EXISTS lpc_checks_scope_child ON lpc_checks (scope_key, child_id)`;
    await this.sql`CREATE INDEX IF NOT EXISTS lpc_statuses_scope_child ON lpc_statuses (scope_key, child_id)`;
    await this.sql`CREATE INDEX IF NOT EXISTS lpc_plans_scope_child ON lpc_plans (scope_key, child_id)`;
    await this.sql`CREATE INDEX IF NOT EXISTS lpc_progress_scope_child ON lpc_progress (scope_key, child_id)`;
  }

  private async one<T>(table: string, scopeKey: string, id: string): Promise<T | undefined> {
    await this.ready;
    const rows = table === "children" ? await this.sql`SELECT data FROM lpc_children WHERE scope_key=${scopeKey} AND id=${id}`
      : table === "checks" ? await this.sql`SELECT data FROM lpc_checks WHERE scope_key=${scopeKey} AND id=${id}`
      : await this.sql`SELECT data FROM lpc_plans WHERE scope_key=${scopeKey} AND id=${id}`;
    return rows[0] ? clone(parseData<T>(rows[0].data)) : undefined;
  }

  async getChild(scopeKey: string, childId: string): Promise<ChildProfile | undefined> { return this.one("children", scopeKey, childId); }
  async getCheck(scopeKey: string, checkId: string): Promise<LearningCheck | undefined> { return this.one("checks", scopeKey, checkId); }
  async getPlan(scopeKey: string, planId: string): Promise<ReviewPlan | undefined> { return this.one("plans", scopeKey, planId); }

  async listChildren(scopeKey: string): Promise<ChildProfile[]> {
    await this.ready;
    const rows = await this.sql`SELECT data FROM lpc_children WHERE scope_key=${scopeKey} ORDER BY id`;
    return rows.map((row: any) => clone(parseData<ChildProfile>(row.data)));
  }

  async upsertChild(scopeKey: string, child: ChildProfile): Promise<ChildProfile> {
    await this.ready;
    const data = JSON.stringify(child);
    await this.sql`INSERT INTO lpc_children (scope_key,id,data) VALUES (${scopeKey},${child.id},${data}::jsonb) ON CONFLICT (scope_key,id) DO UPDATE SET data=EXCLUDED.data`;
    return clone(child);
  }

  async saveCheck(scopeKey: string, check: LearningCheck): Promise<LearningCheck> {
    await this.ready;
    const data = JSON.stringify(check);
    await this.sql`INSERT INTO lpc_checks (scope_key,id,child_id,data) VALUES (${scopeKey},${check.id},${check.childId},${data}::jsonb) ON CONFLICT (scope_key,id) DO UPDATE SET data=EXCLUDED.data, child_id=EXCLUDED.child_id`;
    return clone(check);
  }

  async saveConceptStatuses(scopeKey: string, statuses: ConceptStatus[]): Promise<ConceptStatus[]> {
    await this.ready;
    await this.sql.begin(async (transaction: Sql) => {
      for (const status of statuses) {
        const data = JSON.stringify(status);
        await transaction`INSERT INTO lpc_statuses (scope_key,id,child_id,data) VALUES (${scopeKey},${status.id},${status.childId},${data}::jsonb) ON CONFLICT (scope_key,id) DO UPDATE SET data=EXCLUDED.data, child_id=EXCLUDED.child_id`;
      }
    });
    return clone(statuses);
  }

  async listConceptStatuses(scopeKey: string, childId: string, range?: DateRange): Promise<ConceptStatus[]> {
    await this.ready;
    const rows = await this.sql`SELECT data FROM lpc_statuses WHERE scope_key=${scopeKey} AND child_id=${childId} ORDER BY id`;
    return rows.map((row: any) => parseData<ConceptStatus>(row.data)).filter((status: ConceptStatus) => (!range?.from || status.assessedAt.slice(0, 10) >= range.from.slice(0, 10)) && (!range?.to || status.assessedAt.slice(0, 10) <= range.to.slice(0, 10))).map(clone);
  }

  async savePlan(scopeKey: string, plan: ReviewPlan): Promise<ReviewPlan> {
    await this.ready;
    const data = JSON.stringify(plan);
    await this.sql`INSERT INTO lpc_plans (scope_key,id,child_id,data) VALUES (${scopeKey},${plan.id},${plan.childId},${data}::jsonb) ON CONFLICT (scope_key,id) DO UPDATE SET data=EXCLUDED.data, child_id=EXCLUDED.child_id`;
    return clone(plan);
  }

  async listPlans(scopeKey: string, childId: string): Promise<ReviewPlan[]> {
    await this.ready;
    const rows = await this.sql`SELECT data FROM lpc_plans WHERE scope_key=${scopeKey} AND child_id=${childId} ORDER BY id`;
    return rows.map((row: any) => clone(parseData<ReviewPlan>(row.data)));
  }

  async saveProgress(scopeKey: string, progress: LearningProgress): Promise<LearningProgress> {
    await this.ready;
    const data = JSON.stringify(progress);
    await this.sql`INSERT INTO lpc_progress (scope_key,id,child_id,data) VALUES (${scopeKey},${progress.id},${progress.childId},${data}::jsonb) ON CONFLICT (scope_key,id) DO UPDATE SET data=EXCLUDED.data, child_id=EXCLUDED.child_id`;
    return clone(progress);
  }

  async listProgress(scopeKey: string, childId: string, range?: DateRange): Promise<LearningProgress[]> {
    await this.ready;
    const rows = await this.sql`SELECT data FROM lpc_progress WHERE scope_key=${scopeKey} AND child_id=${childId} ORDER BY id`;
    return rows.map((row: any) => parseData<LearningProgress>(row.data)).filter((progress: LearningProgress) => (!range?.from || progress.recordedAt.slice(0, 10) >= range.from.slice(0, 10)) && (!range?.to || progress.recordedAt.slice(0, 10) <= range.to.slice(0, 10))).map(clone);
  }

  async deleteChild(scopeKey: string, childId: string): Promise<DeleteCounts> {
    await this.ready;
    return await this.sql.begin(async (transaction: Sql) => {
      const progress = await transaction`DELETE FROM lpc_progress WHERE scope_key=${scopeKey} AND child_id=${childId} RETURNING id`;
      const plans = await transaction`DELETE FROM lpc_plans WHERE scope_key=${scopeKey} AND child_id=${childId} RETURNING id`;
      const statuses = await transaction`DELETE FROM lpc_statuses WHERE scope_key=${scopeKey} AND child_id=${childId} RETURNING id`;
      const checks = await transaction`DELETE FROM lpc_checks WHERE scope_key=${scopeKey} AND child_id=${childId} RETURNING id`;
      const children = await transaction`DELETE FROM lpc_children WHERE scope_key=${scopeKey} AND id=${childId} RETURNING id`;
      return { children: children.length, checks: checks.length, statuses: statuses.length, plans: plans.length, progress: progress.length };
    });
  }

  async deleteAllForScope(scopeKey: string): Promise<DeleteCounts> {
    await this.ready;
    return await this.sql.begin(async (transaction: Sql) => {
      const progress = await transaction`DELETE FROM lpc_progress WHERE scope_key=${scopeKey} RETURNING id`;
      const plans = await transaction`DELETE FROM lpc_plans WHERE scope_key=${scopeKey} RETURNING id`;
      const statuses = await transaction`DELETE FROM lpc_statuses WHERE scope_key=${scopeKey} RETURNING id`;
      const checks = await transaction`DELETE FROM lpc_checks WHERE scope_key=${scopeKey} RETURNING id`;
      const children = await transaction`DELETE FROM lpc_children WHERE scope_key=${scopeKey} RETURNING id`;
      return { children: children.length, checks: checks.length, statuses: statuses.length, plans: plans.length, progress: progress.length };
    });
  }
}
