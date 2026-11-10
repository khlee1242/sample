import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { calculate, inputSchema, type CalculationInput } from "../modules/estimating/calculation";
import { toCustomerCalculation } from "../modules/documents/customer-dto";
import type { Database } from "./db/connection";
import { quotes, quoteVersions, quoteLines, clients, sites, auditLogs } from "./db/schema";
import { HttpError, requireAction, type Principal } from "./access";
const quoteSchema = z.object({
  title: z.string().trim().min(1).max(200), clientId: z.uuid(), siteId: z.uuid(), input: inputSchema,
  requestId: z.uuid(), expectedRowVersion: z.number().int().positive().max(2147483646).optional(),
}).strict();
export async function listQuotes(db: Database, principal: Principal) {
  requireAction(principal, "quote:read");
  return db.select({ id: quotes.id, number: quotes.number, title: quotes.title, total: quoteVersions.total, rowVersion: quoteVersions.rowVersion, updatedAt: quotes.updatedAt })
    .from(quotes).innerJoin(quoteVersions, eq(quotes.id, quoteVersions.quoteId))
    .where(eq(quotes.organizationId, principal.organizationId)).orderBy(desc(quotes.updatedAt)).limit(100);
}
export async function readQuote(db: Database, principal: Principal, id: string) {
  requireAction(principal, "quote:read"); z.uuid().parse(id);
  const [row] = await db.select({ quote: quotes, version: quoteVersions }).from(quotes)
    .innerJoin(quoteVersions, eq(quotes.id, quoteVersions.quoteId))
    .where(and(eq(quotes.id, id), eq(quotes.organizationId, principal.organizationId)));
  if (!row) throw new HttpError(404, "견적을 찾을 수 없습니다.");
  const lines = await db.select().from(quoteLines).where(eq(quoteLines.versionId, row.version.id)).orderBy(asc(quoteLines.position));
  const input: CalculationInput = { ...row.version.policy, lines: lines.map((line) => ({
    id: line.lineKey, name: line.name, quantity: line.quantity, salePrice: line.salePrice, materialCost: line.materialCost, laborCost: line.laborCost, expenseCost: line.expenseCost,
  })) };
  const result = calculate(input);
  const metadata = { id: row.quote.id, number: row.quote.number, title: row.quote.title, clientId: row.quote.clientId, siteId: row.quote.siteId, rowVersion: row.version.rowVersion };
  // 원가 권한 없는 역할에는 편집 입력·원가·마진을 반환하지 않는다.
  if (principal.role === "viewer") return { ...metadata, result: toCustomerCalculation(result) };
  requireAction(principal, "cost:read");
  return { ...metadata, input, result };
}
export async function saveQuote(db: Database, principal: Principal, raw: unknown, id?: string) {
  requireAction(principal, "quote:edit"); requireAction(principal, "cost:read");
  const input = quoteSchema.parse(raw); if (id) z.uuid().parse(id);
  if (id && input.expectedRowVersion === undefined) throw new HttpError(400, "수정 버전이 필요합니다.");
  if (!id && input.expectedRowVersion !== undefined) throw new HttpError(400, "새 견적에는 수정 버전을 지정할 수 없습니다.");
  let result: ReturnType<typeof calculate>;
  try { result = calculate(input.input); } catch { throw new HttpError(400, "금액 계산 입력을 확인하세요. 할인은 공급가액을 초과할 수 없습니다."); }
  const requestHash = createHash("sha256").update(JSON.stringify({ title: input.title, clientId: input.clientId, siteId: input.siteId, input: input.input })).digest("hex");
  const quoteId = id ?? input.requestId; // 생성 요청 재시도는 같은 UUID를 사용한다.
  return db.transaction(async (tx) => {
    const [site] = await tx.select({ id: sites.id }).from(sites).innerJoin(clients, eq(sites.clientId, clients.id))
      .where(and(eq(sites.id, input.siteId), eq(clients.id, input.clientId), eq(clients.organizationId, principal.organizationId)));
    if (!site) throw new HttpError(400, "거래처와 현장의 연결을 확인하세요.");
    const policy = { ...input.input }; const { lines, ...settings } = policy;
    let versionId: string; let rowVersion: number; let number: string;
    if (!id) {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
      number = `Q-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const [created] = await tx.insert(quotes).values({ id: quoteId, organizationId: principal.organizationId, number, title: input.title, clientId: input.clientId, siteId: input.siteId, createdBy: principal.userId }).onConflictDoNothing().returning();
      if (!created) {
        const [existing] = await tx.select({ quote: quotes, version: quoteVersions }).from(quotes).innerJoin(quoteVersions, eq(quotes.id, quoteVersions.quoteId)).where(and(eq(quotes.id, quoteId), eq(quotes.organizationId, principal.organizationId), eq(quotes.createdBy, principal.userId)));
        if (existing?.version.rowVersion === 1 && existing.version.lastRequestId === input.requestId && existing.version.requestHash === requestHash) return { id: quoteId, number: existing.quote.number, rowVersion: 1, result };
        throw new HttpError(409, "이미 사용된 생성 요청입니다. 목록에서 저장 결과를 확인하세요.");
      }
      const [version] = await tx.insert(quoteVersions).values({ quoteId, policy: settings, supply: result.supply, vat: result.vat, total: result.total, lastRequestId: input.requestId, requestHash }).returning();
      versionId = version.id; rowVersion = 1;
    } else {
      const [quote] = await tx.select().from(quotes).where(and(eq(quotes.id, id), eq(quotes.organizationId, principal.organizationId)));
      if (!quote) throw new HttpError(404, "견적을 찾을 수 없습니다.");
      number = quote.number;
      const [version] = await tx.update(quoteVersions).set({ policy: settings, supply: result.supply, vat: result.vat, total: result.total, lastRequestId: input.requestId, requestHash, rowVersion: sql`${quoteVersions.rowVersion} + 1`, updatedAt: new Date() })
        .where(and(eq(quoteVersions.quoteId, id), eq(quoteVersions.revisionNo, 1), eq(quoteVersions.rowVersion, input.expectedRowVersion!), eq(quoteVersions.frozen, false))).returning();
      if (!version) {
        const [existing] = await tx.select().from(quoteVersions).where(and(eq(quoteVersions.quoteId, id), eq(quoteVersions.revisionNo, 1)));
        if (existing && !existing.frozen && existing.lastRequestId === input.requestId && existing.requestHash === requestHash) return { id, number, rowVersion: existing.rowVersion, result };
        throw new HttpError(409, "다른 저장이 먼저 반영되었습니다. 현재 입력을 보관한 뒤 견적을 다시 열어 주세요.");
      }
      versionId = version.id; rowVersion = version.rowVersion;
      await tx.update(quotes).set({ title: input.title, clientId: input.clientId, siteId: input.siteId, updatedAt: new Date() }).where(eq(quotes.id, id));
      await tx.delete(quoteLines).where(eq(quoteLines.versionId, versionId));
    }
    await tx.insert(quoteLines).values(lines.map((line, position) => ({
      versionId, lineKey: line.id, position, name: line.name, quantity: line.quantity, salePrice: line.salePrice,
      materialCost: line.materialCost, laborCost: line.laborCost, expenseCost: line.expenseCost,
    })));
    await tx.insert(auditLogs).values({ organizationId: principal.organizationId, actorId: principal.userId, action: id ? "quote:update" : "quote:create", targetId: quoteId,
      detail: { rowVersion, previousRowVersion: input.expectedRowVersion ?? 0, total: result.total, requestId: input.requestId, policyVersion: result.policyVersion } });
    return { id: quoteId, number, rowVersion, result };
  });
}
