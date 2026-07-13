import { afterEach, describe, expect, test } from "bun:test";
import { assertProductionRuntimeConfiguration, currentScopeKey, isPublicScope, requireAuthenticatedScopeKey, runWithRequestHeaders } from "../src/identity.js";
import { currentDate, isoDate } from "../src/lib/date.js";

const originalSalt = process.env.USER_SCOPE_SALT;
const TEST_SALT = "identity-test-salt-that-is-at-least-32-bytes";
afterEach(() => {
  if (originalSalt === undefined) delete process.env.USER_SCOPE_SALT;
  else process.env.USER_SCOPE_SALT = originalSalt;
});

describe("request identity isolation", () => {
  test("public scope is explicit when no trusted identity exists", () => {
    runWithRequestHeaders({}, () => {
      expect(currentScopeKey()).toBe("public");
      expect(isPublicScope()).toBe(true);
      expect(() => requireAuthenticatedScopeKey()).toThrow("로그인한 PlayMCP 사용자");
    });
  });

  test("only one x-playmcp-user-id value is trusted", () => {
    process.env.USER_SCOPE_SALT = TEST_SALT;
    const primary = runWithRequestHeaders({ "x-playmcp-user-id": "primary" }, currentScopeKey);
    const repeated = runWithRequestHeaders({ "x-playmcp-user-id": "primary" }, currentScopeKey);
    expect(primary).toBe(repeated);
    expect(primary).toMatch(/^[a-f0-9]{64}$/);
    expect(runWithRequestHeaders({ "x-user-id": "primary" }, currentScopeKey)).toBe("public");
    expect(runWithRequestHeaders({ "x-forwarded-user": "primary" }, currentScopeKey)).toBe("public");
    expect(runWithRequestHeaders({ authorization: "Bearer x.eyJzdWIiOiJwcmltYXJ5In0.x" }, currentScopeKey)).toBe("public");
    expect(runWithRequestHeaders({ "x-playmcp-user-id": ["primary", "other"] }, currentScopeKey)).toBe("public");
    expect(runWithRequestHeaders({ "x-playmcp-user-id": "primary, other" }, currentScopeKey)).toBe("public");
  });

  test("concurrent PlayMCP request contexts stay separated", async () => {
    process.env.USER_SCOPE_SALT = TEST_SALT;
    const [alpha, beta] = await Promise.all([
      runWithRequestHeaders({ "x-playmcp-user-id": "alpha" }, async () => { await Promise.resolve(); return currentScopeKey(); }),
      runWithRequestHeaders({ "x-playmcp-user-id": "beta" }, async () => { await Promise.resolve(); return currentScopeKey(); }),
    ]);
    expect(alpha).not.toBe(beta);
  });

  test("authenticated requests fail closed when the scope salt is missing or short", () => {
    delete process.env.USER_SCOPE_SALT;
    expect(() => runWithRequestHeaders({ "x-playmcp-user-id": "guardian" }, currentScopeKey)).toThrow("사용자 데이터 보호 설정");
    process.env.USER_SCOPE_SALT = "short";
    expect(() => runWithRequestHeaders({ "x-playmcp-user-id": "guardian" }, currentScopeKey)).toThrow("사용자 데이터 보호 설정");
  });

  test("production requires persistence and a strong salt", () => {
    expect(() => assertProductionRuntimeConfiguration({ NODE_ENV: "production" })).toThrow("DATABASE_URL 또는 STORE_PATH");
    expect(() => assertProductionRuntimeConfiguration({ NODE_ENV: "production", STORE_PATH: "/data/state.json" })).toThrow("사용자 데이터 보호 설정");
    expect(() => assertProductionRuntimeConfiguration({ NODE_ENV: "production", STORE_PATH: "/data/state.json", USER_SCOPE_SALT: "short" })).toThrow("사용자 데이터 보호 설정");
    expect(() => assertProductionRuntimeConfiguration({ NODE_ENV: "production", STORE_PATH: "/data/state.json", USER_SCOPE_SALT: TEST_SALT })).not.toThrow();
    expect(() => assertProductionRuntimeConfiguration({ NODE_ENV: "production", DATABASE_URL: "postgres://db", USER_SCOPE_SALT: TEST_SALT })).not.toThrow();
    expect(() => assertProductionRuntimeConfiguration({ NODE_ENV: "test" })).not.toThrow();
  });

  test("calendar dates are strict and use the configured Korean default", () => {
    expect(isoDate("2026-07-13")).toBe("2026-07-13");
    expect(() => isoDate("2026-02-30")).toThrow("유효한 날짜");
    expect(() => isoDate("07/13/2026")).toThrow("YYYY-MM-DD");
    expect(currentDate("Asia/Seoul")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
