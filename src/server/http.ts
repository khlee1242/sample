import { ZodError } from "zod";
import { HttpError } from "./access";
export function assertSameOrigin(request: Request) {
  if (request.headers.get("origin") !== process.env.BETTER_AUTH_URL) throw new HttpError(403, "허용되지 않은 요청 출처입니다.");
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "JSON 형식이 필요합니다.");
  if (!request.body) throw new HttpError(400, "요청 본문이 없습니다.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > 1024 * 1024) { await reader.cancel(); throw new HttpError(413, "요청이 너무 큽니다."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
  catch { throw new HttpError(400, "JSON 입력을 확인하세요."); }
}
export async function handle(work: () => Promise<unknown>, status = 200) {
  try { return Response.json(await work(), { status, headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof ZodError) return Response.json({ error: "입력값을 확인하세요.", issues: error.issues.map((v) => ({ path: v.path.join("."), message: v.message })) }, { status: 400 });
    console.error("Request failed", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "요청을 처리하지 못했습니다." }, { status: 500 });
  }
}
