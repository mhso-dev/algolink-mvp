// @MX:NOTE: SPEC-DB-001 §2.5 REQ-DB001-CLIENT — 고객사 + 담당자.
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { files } from "./files";

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyName: text("company_name").notNull(),
    address: text("address"),
    businessLicenseFileId: uuid("business_license_file_id").references(() => files.id, {
      onDelete: "set null",
    }),
    handoverMemo: text("handover_memo"), // 인수인계용 메모 (마크다운)
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by"),
  },
  (t) => [
    index("idx_clients_company").on(t.companyName),
    index("idx_clients_deleted").on(t.deletedAt),
  ],
);

export const clientContacts = pgTable(
  "client_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: text("position"),
    email: text("email"),
    phone: text("phone"),
    sortOrder: text("sort_order").default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_client_contacts_client").on(t.clientId)],
);

export type Client = typeof clients.$inferSelect;
export type ClientContact = typeof clientContacts.$inferSelect;
