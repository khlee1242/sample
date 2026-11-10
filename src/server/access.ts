import { eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { getConnection } from "./db/connection";
import { memberships } from "./db/schema";
import { assertPermission, type Action, type Role } from "../modules/identity/permissions";
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type Principal = { userId: string; organizationId: string; role: Role };
export async function getPrincipal(headers: Headers): Promise<Principal> {
  const session = await getAuth().api.getSession({ headers });
  if (!session) throw new HttpError(401, "로그인이 필요합니다.");
  const [member] = await getConnection().db.select().from(memberships).where(eq(memberships.userId, session.user.id));
  if (!member?.active) throw new HttpError(403, "활성 직원 계정이 필요합니다.");
  return { userId: session.user.id, organizationId: member.organizationId, role: member.role };
}
export function requireAction(principal: Principal, action: Action) {
  try { assertPermission(principal.role, action); } catch { throw new HttpError(403, "이 작업의 권한이 없습니다."); }
}
