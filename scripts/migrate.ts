import { existsSync } from "node:fs";
import { getConnection } from "../src/server/db/connection";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const connection = getConnection();
try { await connection.migrate(); console.log("DB 마이그레이션 완료"); } finally { await connection.close(); }
