import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "pg", "better-auth", "@better-auth/drizzle-adapter"],
};
export default config;
