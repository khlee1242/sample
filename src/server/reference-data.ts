import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "./db/connection";
import { clients, sites, auditLogs } from "./db/schema";
import { HttpError, requireAction, type Principal } from "./access";
const referenceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("client"), name: z.string().trim().min(1).max(200) }).strict(),
  z.object({ type: z.literal("site"), name: z.string().trim().min(1).max(200), clientId: z.uuid() }).strict(),
]);
export async function listReferences(db: Database, principal: Principal) {
  requireAction(principal, "quote:read");
  const clientRows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.organizationId, principal.organizationId));
  const siteRows = await db.select({ id: sites.id, name: sites.name, clientId: sites.clientId }).from(sites).innerJoin(clients, eq(sites.clientId, clients.id)).where(eq(clients.organizationId, principal.organizationId));
  return { clients: clientRows, sites: siteRows };
}
export async function createReference(db: Database, principal: Principal, raw: unknown) {
  requireAction(principal, "master:edit"); const input = referenceSchema.parse(raw);
  return db.transaction(async (tx) => {
    let created: { id: string; name: string } | undefined;
    if (input.type === "client") {
      [created] = await tx.insert(clients).values({ organizationId: principal.organizationId, name: input.name }).onConflictDoNothing().returning();
    } else {
      const [client] = await tx.select().from(clients).where(and(eq(clients.id, input.clientId), eq(clients.organizationId, principal.organizationId)));
      if (!client) throw new HttpError(404, "거래처를 찾을 수 없습니다.");
      [created] = await tx.insert(sites).values({ clientId: input.clientId, name: input.name }).onConflictDoNothing().returning();
    }
    if (!created) throw new HttpError(409, "동일한 이름이 이미 등록되어 있습니다.");
    await tx.insert(auditLogs).values({ organizationId: principal.organizationId, actorId: principal.userId, action: `${input.type}:create`, targetId: created.id, detail: { name: created.name } });
    return created;
  });
}
