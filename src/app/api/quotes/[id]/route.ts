import { getPrincipal } from "../../../../server/access";
import { getConnection } from "../../../../server/db/connection";
import { assertSameOrigin, handle, readJson } from "../../../../server/http";
import { readQuote, saveQuote } from "../../../../server/quotes";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) {
  return handle(async () => readQuote(getConnection().db, await getPrincipal(request.headers), (await context.params).id));
}
export async function PATCH(request: Request, context: Context) {
  return handle(async () => { assertSameOrigin(request); const actor = await getPrincipal(request.headers); return saveQuote(getConnection().db, actor, await readJson(request), (await context.params).id); });
}
