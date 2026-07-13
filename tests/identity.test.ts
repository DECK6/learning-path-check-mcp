import { afterEach, describe, expect, test } from "bun:test";
import { currentScopeKey, isPublicScope, runWithRequestHeaders } from "../src/identity.js";
import { currentDate, isoDate } from "../src/lib/date.js";

const originalSalt = process.env.USER_SCOPE_SALT;
afterEach(() => {
  if (originalSalt === undefined) delete process.env.USER_SCOPE_SALT;
  else process.env.USER_SCOPE_SALT = originalSalt;
});

describe("request identity isolation", () => {
  test("public scope is explicit when no identity exists", () => {
    runWithRequestHeaders({}, () => {
      expect(currentScopeKey()).toBe("public");
      expect(isPublicScope()).toBe(true);
    });
  });

  test("header precedence and salt produce stable opaque keys", () => {
    process.env.USER_SCOPE_SALT = "test-salt";
    const first = runWithRequestHeaders({ "x-playmcp-user-id": "primary", "x-user-id": "secondary" }, currentScopeKey);
    const repeated = runWithRequestHeaders({ "x-playmcp-user-id": "primary" }, currentScopeKey);
    const secondary = runWithRequestHeaders({ "x-user-id": "secondary" }, currentScopeKey);
    expect(first).toBe(repeated);
    expect(first).not.toBe(secondary);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  test("JWT sub fallback and concurrent async contexts stay separated", async () => {
    const token = `x.${Buffer.from(JSON.stringify({ sub: "jwt-user" })).toString("base64url")}.x`;
    const jwt = runWithRequestHeaders({ authorization: `Bearer ${token}` }, currentScopeKey);
    const direct = runWithRequestHeaders({ "x-user-id": "jwt-user" }, currentScopeKey);
    expect(jwt).toBe(direct);
    const [alpha, beta] = await Promise.all([
      runWithRequestHeaders({ "x-user-id": "alpha" }, async () => { await Promise.resolve(); return currentScopeKey(); }),
      runWithRequestHeaders({ "x-user-id": "beta" }, async () => { await Promise.resolve(); return currentScopeKey(); }),
    ]);
    expect(alpha).not.toBe(beta);
  });

  test("calendar dates are strict and use the configured Korean default", () => {
    expect(isoDate("2026-07-13")).toBe("2026-07-13");
    expect(() => isoDate("2026-02-30")).toThrow("유효한 날짜");
    expect(() => isoDate("07/13/2026")).toThrow("YYYY-MM-DD");
    expect(currentDate("Asia/Seoul")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
