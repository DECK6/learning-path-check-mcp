import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export type RequestHeaders = Record<string, string | string[] | undefined>;

const context = new AsyncLocalStorage<RequestHeaders>();

function playMcpUserId(): string | undefined {
  const value = (context.getStore() ?? {})["x-playmcp-user-id"];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 256 || /[,\r\n]/.test(normalized)) return undefined;
  return normalized;
}

function scopeSalt(env: NodeJS.ProcessEnv = process.env): string {
  const salt = env.USER_SCOPE_SALT?.trim();
  if (!salt || Buffer.byteLength(salt, "utf8") < 32) {
    throw new Error("사용자 데이터 보호 설정이 완료되지 않았습니다.");
  }
  return salt;
}

export function runWithRequestHeaders<T>(headers: RequestHeaders, callback: () => T): T {
  return context.run(headers, callback);
}

export function currentScopeKey(): string {
  const identity = playMcpUserId();
  if (!identity) return "public";
  return createHash("sha256").update(`${scopeSalt()}\0${identity}`).digest("hex");
}

export function requireAuthenticatedScopeKey(): string {
  if (!playMcpUserId()) throw new Error("로그인한 PlayMCP 사용자만 학습 기록을 저장하거나 조회할 수 있습니다.");
  return currentScopeKey();
}

export function isPublicScope(): boolean {
  return currentScopeKey() === "public";
}

export function assertProductionRuntimeConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  if (!env.DATABASE_URL?.trim() && !env.STORE_PATH?.trim()) {
    throw new Error("운영 환경에는 DATABASE_URL 또는 STORE_PATH가 필요합니다.");
  }
  scopeSalt(env);
}
