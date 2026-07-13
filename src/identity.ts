import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export type RequestHeaders = Record<string, string | string[] | undefined>;

const context = new AsyncLocalStorage<RequestHeaders>();

export const USER_TOKEN_HEADER = "x-learning-path-token";

function userAccessToken(): string | undefined {
  const value = (context.getStore() ?? {})[USER_TOKEN_HEADER];
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (Buffer.byteLength(normalized, "utf8") < 32 || normalized.length > 256 || /[,\r\n]/.test(normalized)) return undefined;
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
  const token = userAccessToken();
  if (!token) return "public";
  return createHash("sha256").update(`${scopeSalt()}\0${token}`).digest("hex");
}

export function requireAuthenticatedScopeKey(): string {
  if (!userAccessToken()) throw new Error("학습 기록을 저장하거나 조회하려면 PlayMCP Key/Token 연결에 32자 이상의 비밀 토큰이 필요합니다.");
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
