import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { getConnection } from "../src/server/db/connection";
import { account, auditLogs, memberships, organizations, user } from "../src/server/db/schema";
await mkdir(".data", { recursive: true });
if (!existsSync(".env.local")) await writeFile(".env.local", `PGLITE_DATA_DIR=.data/pglite\nBETTER_AUTH_URL=http://127.0.0.1:3000\nBETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}\n`, { flag: "wx", mode: 0o600 });
process.loadEnvFile(".env.local");
const connection = getConnection();
try {
  await connection.migrate();
  if ((await connection.db.select({ id: user.id }).from(user).limit(1)).length) { console.log("기존 계정을 유지했습니다. 초기 설정 완료."); }
  else {
    const password = randomBytes(24).toString("base64url"); const id = randomUUID(); const organizationId = randomUUID();
    const passwordHash = await hashPassword(password);
    await connection.db.transaction(async (tx) => {
      await tx.insert(organizations).values({ id: organizationId, name: "우리 회사" });
      await tx.insert(user).values({ id, name: "관리자", email: "admin@example.test", emailVerified: false });
      await tx.insert(account).values({ id: randomUUID(), userId: id, providerId: "credential", accountId: id, password: passwordHash });
      await tx.insert(memberships).values({ userId: id, organizationId, role: "admin" });
      await tx.insert(auditLogs).values({ organizationId, actorId: id, action: "system:bootstrap", targetId: id, detail: { initialAdmin: true } });
    });
    await writeFile(".data/initial-admin.txt", `로컬 개발용 초기 관리자\n이메일: admin@example.test\n비밀번호: ${password}\n\n로그인 후 계정 보안에서 비밀번호와 2단계 인증을 설정하세요.\n운영 계정이 아닙니다.\n`, { flag: "wx", mode: 0o600 });
    console.log("초기 설정 완료. 로그인 정보: .data/initial-admin.txt (비밀번호는 로그에 출력하지 않습니다.)");
  }
} finally { await connection.close(); }
