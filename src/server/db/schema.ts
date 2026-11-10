import { boolean, check, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid, bigint } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CalculationInput } from "../../modules/estimating/calculation";
import type { Role } from "../../modules/identity/permissions";

const time = (name: string) => timestamp(name, { withTimezone: true });
const authId = () => text("id").primaryKey().default(sql`gen_random_uuid()::text`);
export const user = pgTable("auth_users", {
  id: authId(), name: text("name").notNull(), email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false), image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: time("created_at").notNull().defaultNow(), updatedAt: time("updated_at").notNull().defaultNow(),
});
export const session = pgTable("auth_sessions", {
  id: authId(), userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(), expiresAt: time("expires_at").notNull(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"),
  createdAt: time("created_at").notNull().defaultNow(), updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);
export const account = pgTable("auth_accounts", {
  id: authId(), userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(), password: text("password"),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: time("access_token_expires_at"), refreshTokenExpiresAt: time("refresh_token_expires_at"), scope: text("scope"),
  createdAt: time("created_at").notNull().defaultNow(), updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [unique("accounts_provider_unique").on(t.providerId, t.accountId)]);
export const verification = pgTable("auth_verifications", {
  id: authId(), identifier: text("identifier").notNull(), value: text("value").notNull(), expiresAt: time("expires_at").notNull(),
  createdAt: time("created_at").notNull().defaultNow(), updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);
export const twoFactor = pgTable("auth_two_factor", {
  id: authId(), userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  secret: text("secret").notNull(), backupCodes: text("backup_codes").notNull(), verified: boolean("verified").default(true),
  failedVerificationCount: integer("failed_verification_count").default(0), lockedUntil: time("locked_until"),
}, (t) => [index("two_factor_user_idx").on(t.userId)]);
export const rateLimit = pgTable("auth_rate_limits", {
  id: authId(), key: text("key").notNull().unique(), count: integer("count").notNull(), lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const organizations = pgTable("organizations", { id: uuid("id").primaryKey().defaultRandom(), name: text("name").notNull() });
export const memberships = pgTable("memberships", {
  userId: text("user_id").primaryKey().references(() => user.id), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  role: text("role").$type<Role>().notNull(), active: boolean("active").notNull().default(true),
}, (t) => [check("membership_role_check", sql`${t.role} in ('admin','author','approver','viewer')`)]);
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id), name: text("name").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [unique("clients_org_name_unique").on(t.organizationId, t.name)]);
export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(), clientId: uuid("client_id").notNull().references(() => clients.id), name: text("name").notNull(),
  createdAt: time("created_at").notNull().defaultNow(),
}, (t) => [unique("sites_client_name_unique").on(t.clientId, t.name)]);
export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  number: text("number").notNull(), title: text("title").notNull(), clientId: uuid("client_id").notNull().references(() => clients.id),
  siteId: uuid("site_id").notNull().references(() => sites.id), createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: time("created_at").notNull().defaultNow(), updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [unique("quote_org_number_unique").on(t.organizationId, t.number), index("quotes_org_updated_idx").on(t.organizationId, t.updatedAt)]);
export const quoteVersions = pgTable("quote_versions", {
  id: uuid("id").primaryKey().defaultRandom(), quoteId: uuid("quote_id").notNull().references(() => quotes.id),
  revisionNo: integer("revision_no").notNull().default(1), rowVersion: integer("row_version").notNull().default(1),
  frozen: boolean("frozen").notNull().default(false),
  lastRequestId: uuid("last_request_id").notNull(), requestHash: text("request_hash").notNull(),
  policy: jsonb("policy").$type<Omit<CalculationInput, "lines">>().notNull(),
  supply: numeric("supply", { precision: 40, scale: 0 }).notNull(), vat: numeric("vat", { precision: 40, scale: 0 }).notNull(), total: numeric("total", { precision: 40, scale: 0 }).notNull(),
  createdAt: time("created_at").notNull().defaultNow(), updatedAt: time("updated_at").notNull().defaultNow(),
}, (t) => [unique("quote_revision_unique").on(t.quoteId, t.revisionNo), check("revision_positive", sql`${t.revisionNo} > 0 AND ${t.rowVersion} > 0`)]);
export const quoteLines = pgTable("quote_lines", {
  id: uuid("id").primaryKey().defaultRandom(), versionId: uuid("version_id").notNull().references(() => quoteVersions.id),
  lineKey: text("line_key").notNull(), position: integer("position").notNull(), name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(), salePrice: numeric("sale_price", { precision: 18, scale: 6 }).notNull(),
  materialCost: numeric("material_cost", { precision: 18, scale: 6 }).notNull(), laborCost: numeric("labor_cost", { precision: 18, scale: 6 }).notNull(), expenseCost: numeric("expense_cost", { precision: 18, scale: 6 }).notNull(),
}, (t) => [unique("version_line_key_unique").on(t.versionId, t.lineKey), unique("version_line_position_unique").on(t.versionId, t.position),
  check("line_values_nonnegative", sql`${t.quantity} >= 0 AND ${t.salePrice} >= 0 AND ${t.materialCost} >= 0 AND ${t.laborCost} >= 0 AND ${t.expenseCost} >= 0`)]);
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(), organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  actorId: text("actor_id").notNull().references(() => user.id), action: text("action").notNull(), targetId: text("target_id").notNull(),
  detail: jsonb("detail").$type<Record<string, string | number | boolean>>().notNull(), createdAt: time("created_at").notNull().defaultNow(),
});
