import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHmac, randomUUID, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import * as connectionModule from "../src/server/db/connection";
import * as authModule from "../src/server/auth";
import { account, auditLogs, memberships, organizations, quotes, quoteVersions, rateLimit, user } from "../src/server/db/schema";
import { createReference } from "../src/server/reference-data";
import { saveQuote, readQuote } from "../src/server/quotes";
import { sampleInput } from "../src/modules/estimating/sample";
import type { Principal } from "../src/server/access";
import * as collectionRoute from "../src/app/api/quotes/route";
import * as detailRoute from "../src/app/api/quotes/[id]/route";

const base = "http://127.0.0.1:3000";
const connection = connectionModule.openDatabase();
const password = randomBytes(18).toString("base64url");
const actor: Principal = { userId: randomUUID(), organizationId: randomUUID(), role: "admin" };
const viewer: Principal = { userId: randomUUID(), organizationId: actor.organizationId, role: "viewer" };
let authentication: ReturnType<typeof authModule.createAuthentication>;
let adminCookie = ""; let viewerCookie = ""; let clientId = ""; let siteId = "";
const body = () => ({ title: "통신공사", clientId, siteId, input: sampleInput(), requestId: randomUUID() });
function request(path: string, method = "GET", value?: unknown, cookie = adminCookie, origin = base) {
  return new Request(base + path, { method, headers: { cookie, origin, "Content-Type": "application/json" }, ...(value ? { body: JSON.stringify(value) } : {}) });
}
function cookieFrom(response: Response) { return response.headers.getSetCookie().map((v) => v.split(";")[0]).join("; "); }
function totpCode(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = secret.toUpperCase().replaceAll("=", "").split("").map((v) => alphabet.indexOf(v).toString(2).padStart(5, "0")).join("");
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", key).update(counter).digest(); const offset = hash[hash.length - 1] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, "0");
}

beforeAll(async () => {
  await connection.migrate();
  await connection.db.insert(organizations).values({ id: actor.organizationId, name: "테스트 회사" });
  const hashed = await hashPassword(password);
  for (const member of [actor, viewer]) {
    await connection.db.insert(user).values({ id: member.userId, name: member.role, email: `${member.role}@example.test` });
    await connection.db.insert(account).values({ id: randomUUID(), userId: member.userId, providerId: "credential", accountId: member.userId, password: hashed });
    await connection.db.insert(memberships).values(member);
  }
  authentication = authModule.createAuthentication(connection.db, randomBytes(48).toString("base64url"), base);
  vi.spyOn(connectionModule, "getConnection").mockReturnValue(connection);
  vi.spyOn(authModule, "getAuth").mockReturnValue(authentication);
  process.env.BETTER_AUTH_URL = base;
  for (const role of ["admin", "viewer"]) {
    const response = await authentication.handler(request("/api/auth/sign-in/email", "POST", { email: `${role}@example.test`, password }, ""));
    expect(response.status).toBe(200);
    const cookie = cookieFrom(response); expect(cookie).toContain("session_token");
    if (role === "admin") adminCookie = cookie; else viewerCookie = cookie;
  }
  clientId = (await createReference(connection.db, actor, { type: "client", name: "거래처" })).id;
  siteId = (await createReference(connection.db, actor, { type: "site", name: "현장", clientId })).id;
}, 30000);
afterAll(async () => { vi.restoreAllMocks(); await connection.close(); });

describe("인증된 DB 저장 API", () => {
  it("비로그인 목록과 상세 조회는 401", async () => {
    expect((await collectionRoute.GET(request("/api/quotes", "GET", undefined, ""))).status).toBe(401);
    expect((await detailRoute.GET(request("/api/quotes/a", "GET", undefined, ""), { params: Promise.resolve({ id: randomUUID() }) })).status).toBe(401);
  });
  it("공개 회원가입 차단", async () => {
    const response = await authentication.handler(request("/api/auth/sign-up/email", "POST", { email: "stranger@example.test", password, name: "stranger" }, ""));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
  it("외부 Origin으로 저장 불가", async () => {
    expect((await collectionRoute.POST(request("/api/quotes", "POST", body(), adminCookie, "https://other.example"))).status).toBe(403);
  });
  it("비활성화된 직원의 기존 세션은 자료 접근 불가", async () => {
    await connection.db.update(memberships).set({ active: false }).where(eq(memberships.userId, viewer.userId));
    try { expect((await collectionRoute.GET(request("/api/quotes", "GET", undefined, viewerCookie))).status).toBe(403); }
    finally { await connection.db.update(memberships).set({ active: true }).where(eq(memberships.userId, viewer.userId)); }
  });
  it("위조 합계 필드를 거부", async () => {
    const response = await collectionRoute.POST(request("/api/quotes", "POST", { ...body(), total: "1" }));
    expect(response.status).toBe(400);
  });
  it("서버 재계산·저장·100행 다시 열기", async () => {
    const input = body(); input.input.lines = Array.from({ length: 100 }, (_, i) => ({ ...input.input.lines[0], id: String(i) }));
    const response = await collectionRoute.POST(request("/api/quotes", "POST", input)); expect(response.status).toBe(201);
    const saved = await response.json(); expect(saved.result.total).toBe("101750000");
    const detail = await detailRoute.GET(request(`/api/quotes/${saved.id}`), { params: Promise.resolve({ id: saved.id }) });
    const loaded = await detail.json(); expect(loaded.input.lines).toHaveLength(100);
    expect(loaded.input.lines.map((v: { id: string }) => v.id)).toEqual(input.input.lines.map((v) => v.id));
    expect(loaded.result).toEqual(saved.result);
  });
  it("조회자는 원가 입력과 마진을 받지 못하고 저장도 금지", async () => {
    const saved = await saveQuote(connection.db, actor, body());
    const response = await detailRoute.GET(request(`/api/quotes/${saved.id}`, "GET", undefined, viewerCookie), { params: Promise.resolve({ id: saved.id }) });
    expect(response.status).toBe(200); const loaded = await response.json();
    expect(loaded.input).toBeUndefined(); expect(JSON.stringify(loaded)).not.toMatch(/materialCost|laborCost|expenseCost|marginPercent|totalCost|expectedProfit/);
    expect((await collectionRoute.POST(request("/api/quotes", "POST", body(), viewerCookie))).status).toBe(403);
  });
  it("동시 수정은 한 건만 성공하고 실패한 저장은 감사에 남지 않음", async () => {
    const value = body(); const saved = await saveQuote(connection.db, actor, value);
    const responses = await Promise.all(["첫 수정", "다른 수정"].map((title) => detailRoute.PATCH(request(`/api/quotes/${saved.id}`, "PATCH", { ...value, title, requestId: randomUUID(), expectedRowVersion: 1 }), { params: Promise.resolve({ id: saved.id }) })));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const [version] = await connection.db.select().from(quoteVersions).where(eq(quoteVersions.quoteId, saved.id)); expect(version.rowVersion).toBe(2);
    const logs = await connection.db.select().from(auditLogs).where(eq(auditLogs.targetId, saved.id)); expect(logs).toHaveLength(2);
  });
  it("같은 생성·수정 요청 재시도는 중복 저장하지 않음", async () => {
    const input = body(); const created = await saveQuote(connection.db, actor, input);
    expect(await saveQuote(connection.db, actor, input)).toEqual(created);
    const update = { ...input, title: "수정", expectedRowVersion: 1, requestId: randomUUID() };
    const updated = await saveQuote(connection.db, actor, update, created.id);
    expect(await saveQuote(connection.db, actor, update, created.id)).toEqual(updated);
    expect(await connection.db.select().from(auditLogs).where(eq(auditLogs.targetId, created.id))).toHaveLength(2);
  });
  it("동결된 버전 수정 거부", async () => {
    const value = body(); const saved = await saveQuote(connection.db, actor, value);
    await connection.db.update(quoteVersions).set({ frozen: true }).where(eq(quoteVersions.quoteId, saved.id));
    await expect(saveQuote(connection.db, actor, { ...value, requestId: randomUUID(), expectedRowVersion: 1 }, saved.id)).rejects.toMatchObject({ status: 409 });
  });
  it("다른 회사 자료는 조회·참조 불가", async () => {
    const saved = await saveQuote(connection.db, actor, body()); const other = { ...actor, organizationId: randomUUID() };
    await expect(readQuote(connection.db, other, saved.id)).rejects.toMatchObject({ status: 404 });
    await expect(saveQuote(connection.db, other, body())).rejects.toMatchObject({ status: 400 });
  });
  it("다른 거래처의 현장 연결 거부", async () => {
    const other = await createReference(connection.db, actor, { type: "client", name: "다른 거래처" });
    await expect(saveQuote(connection.db, actor, { ...body(), clientId: other.id })).rejects.toMatchObject({ status: 400 });
  });
  it("감사 실패 시 견적·행도 트랜잭션 롤백", async () => {
    const input = body();
    await connection.db.execute(sql`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced audit failure'; END; $$`);
    await connection.db.execute(sql`CREATE TRIGGER reject_test_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_test_audit()`);
    try {
      await expect(saveQuote(connection.db, actor, input)).rejects.toThrow();
      expect(await connection.db.select().from(quotes).where(and(eq(quotes.id, input.requestId), eq(quotes.organizationId, actor.organizationId)))).toHaveLength(0);
    } finally { await connection.db.execute(sql`DROP TRIGGER reject_test_audit ON audit_logs`); await connection.db.execute(sql`DROP FUNCTION reject_test_audit()`); }
  });
  it("로그아웃 후 세션 재사용 불가", async () => {
    const response = await authentication.handler(request("/api/auth/sign-in/email", "POST", { email: "admin@example.test", password }, ""));
    const cookie = cookieFrom(response);
    expect((await authentication.handler(request("/api/auth/sign-out", "POST", {}, cookie))).status).toBe(200);
    expect((await collectionRoute.GET(request("/api/quotes", "GET", undefined, cookie))).status).toBe(401);
  });
  it("2단계 인증 등록과 비밀번호 단독 로그인 차단·복구 코드 로그인", async () => {
    const enable = await authentication.handler(request("/api/auth/two-factor/enable", "POST", { password }, adminCookie));
    expect(enable.status).toBe(200); const setup = await enable.json();
    const secret = new URL(setup.totpURI).searchParams.get("secret")!;
    const verify = await authentication.handler(request("/api/auth/two-factor/verify-totp", "POST", { code: totpCode(secret), trustDevice: false }, adminCookie));
    expect(verify.status).toBe(200);
    const signIn = await authentication.handler(request("/api/auth/sign-in/email", "POST", { email: "admin@example.test", password }, ""));
    expect(signIn.status).toBe(200); expect((await signIn.json()).twoFactorRedirect).toBe(true);
    const pendingCookie = cookieFrom(signIn);
    expect((await collectionRoute.GET(request("/api/quotes", "GET", undefined, pendingCookie))).status).toBe(401);
    const backup = await authentication.handler(request("/api/auth/two-factor/verify-backup-code", "POST", { code: setup.backupCodes[0], trustDevice: false }, pendingCookie));
    expect(backup.status).toBe(200);
    expect((await collectionRoute.GET(request("/api/quotes", "GET", undefined, cookieFrom(backup)))).status).toBe(200);
  });
  it("로그인 요청 횟수를 DB 기반으로 제한", async () => {
    await connection.db.delete(rateLimit);
    const responses: number[] = [];
    for (let i = 0; i < 6; i++) responses.push((await authentication.handler(request("/api/auth/sign-in/email", "POST", { email: "viewer@example.test", password: "incorrect-password" }, ""))).status);
    expect(responses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]); expect(responses[5]).toBe(429);
  });
});
