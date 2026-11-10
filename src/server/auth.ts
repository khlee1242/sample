import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { twoFactor } from "better-auth/plugins";
import type { Database } from "./db/connection";
import { getConnection } from "./db/connection";
import * as schema from "./db/schema";

export function createAuthentication(db: Database, secret: string, baseURL: string) {
  if (secret.length < 32) throw new Error("인증 비밀키는 32자 이상이어야 합니다.");
  return betterAuth({
    appName: "정보통신공사 견적관리", baseURL, secret,
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 15, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100, customRules: { "/sign-in/email": { window: 60, max: 5 } } },
    plugins: [twoFactor({ issuer: "견적관리" })],
    advanced: { database: { generateId: "uuid" } },
  });
}
type Authentication = ReturnType<typeof createAuthentication>;
const globalAuth = globalThis as typeof globalThis & { estimateAuth?: Authentication };
export function getAuth() {
  if (!globalAuth.estimateAuth) {
    if (!process.env.BETTER_AUTH_SECRET || !process.env.BETTER_AUTH_URL) throw new Error("인증 설정이 없습니다. setup을 실행하세요.");
    globalAuth.estimateAuth = createAuthentication(getConnection().db, process.env.BETTER_AUTH_SECRET, process.env.BETTER_AUTH_URL);
  }
  return globalAuth.estimateAuth;
}
