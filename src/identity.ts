import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export type RequestHeaders = Record<string, string | string[] | undefined>;

const context = new AsyncLocalStorage<RequestHeaders>();

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function jwtSubject(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith("Bearer ")) return undefined;
  const token = authorization.slice(7).trim();
  const payload = token.split(".")[1];
  if (!payload) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub?: unknown };
    return typeof parsed.sub === "string" && parsed.sub.trim() ? parsed.sub.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function runWithRequestHeaders<T>(headers: RequestHeaders, callback: () => T): T {
  return context.run(headers, callback);
}

export function currentScopeKey(): string {
  const headers = context.getStore() ?? {};
  const identity = first(headers["x-playmcp-user-id"])
    ?? first(headers["x-user-id"])
    ?? first(headers["x-forwarded-user"])
    ?? jwtSubject(first(headers.authorization));
  if (!identity) return "public";
  const salt = process.env.USER_SCOPE_SALT ?? "learning-path-check-public-salt-v1";
  return createHash("sha256").update(`${salt}\0${identity}`).digest("hex");
}

export function isPublicScope(): boolean {
  return currentScopeKey() === "public";
}
