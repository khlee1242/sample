import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { openDatabase } from "../src/server/db/connection";
import { organizations, user } from "../src/server/db/schema";
import { createReference } from "../src/server/reference-data";
import { saveQuote, readQuote } from "../src/server/quotes";
import { sampleInput } from "../src/modules/estimating/sample";

it("파일 DB를 닫고 다시 열어도 견적·금액·행이 유지됨", async () => {
  const tempRoot = path.resolve(os.tmpdir());
  const dataDir = await mkdtemp(path.join(tempRoot, "estimate-test-"));
  let connection = openDatabase({ dataDir }); let closed = false;
  try {
    await connection.migrate();
    const actor = { userId: randomUUID(), organizationId: randomUUID(), role: "admin" as const };
    await connection.db.insert(organizations).values({ id: actor.organizationId, name: "복원 테스트" });
    await connection.db.insert(user).values({ id: actor.userId, name: "test", email: "test@example.test" });
    const client = await createReference(connection.db, actor, { type: "client", name: "거래처" });
    const site = await createReference(connection.db, actor, { type: "site", name: "현장", clientId: client.id });
    const saved = await saveQuote(connection.db, actor, { title: "유지 확인", clientId: client.id, siteId: site.id, input: sampleInput(), requestId: randomUUID() });
    await connection.close(); closed = true;
    connection = openDatabase({ dataDir }); closed = false;
    const loaded = await readQuote(connection.db, actor, saved.id);
    expect(loaded.result.total).toBe("1017500"); expect(loaded.title).toBe("유지 확인");
    expect("input" in loaded && loaded.input?.lines[0].quantity).toBe("5.000000");
  } finally {
    if (!closed) await connection.close();
    const resolved = path.resolve(dataDir);
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith("estimate-test-")) throw new Error("테스트 임시 경로 검증 실패");
    await rm(resolved, { recursive: true, force: true });
  }
}, 30000);
