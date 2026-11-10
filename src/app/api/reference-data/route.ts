import { getPrincipal } from "../../../server/access";
import { getConnection } from "../../../server/db/connection";
import { assertSameOrigin, handle, readJson } from "../../../server/http";
import { createReference, listReferences } from "../../../server/reference-data";
export const runtime = "nodejs";
export async function GET(request: Request) { return handle(async () => listReferences(getConnection().db, await getPrincipal(request.headers))); }
export async function POST(request: Request) {
  return handle(async () => { assertSameOrigin(request); const actor = await getPrincipal(request.headers); return createReference(getConnection().db, actor, await readJson(request)); }, 201);
}
