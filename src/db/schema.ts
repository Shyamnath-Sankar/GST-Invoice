import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * Every money column is integer paise. Every tax rate is integer basis points.
 * Quantities keep three decimals. Dates are `YYYY-MM-DD` strings in the application.
 */

export type UserRole = "owner" | "accountant";
export type PartyKind = "customer" | "supplier";
export type DocType = "invoice" | "credit_note" | "debit_note";
export type PriceMode = "inclusive" | "exclusive";
export type FilingFrequency = "monthly" | "quarterly";
export type RegistrationType = "regular" | "composition";
export type SupplyKind = "taxable" | "exempt" | "nil" | "non_gst" | "zero_rated";
export type DocStatus = "active" | "cancelled";
export type ReconStatus = "pending" | "matched" | "mismatch" | "missing_in_2b" | "only_in_2b";
export type PurchaseCategory = "inputs" | "input_services" | "capital_goods" | "expense";
export type ReturnStatus = "open" | "approved" | "filed";
export type ItcKind = "reversal" | "reclaim";
export type DocumentEntity = "sale" | "purchase" | "return" | "party";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").$type<UserRole>().notNull().default("accountant"),
    passwordHash: text("password_hash").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("users_email_uq").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tokenHash: text("token_hash").notNull(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    revoked: boolean("revoked").notNull().default(false),
  },
  (table) => [
    uniqueIndex("sessions_token_uq").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const loginHistory = pgTable(
  "login_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    success: boolean("success").notNull(),
    event: text("event").notNull().default("login"),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("login_history_email_at_idx").on(table.email, table.at),
    index("login_history_at_idx").on(table.at),
  ],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    used: boolean("used").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("password_resets_token_uq").on(table.tokenHash)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    userId: bigint("user_id", { mode: "number" }),
    userEmail: text("user_email").notNull().default(""),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull().default(""),
    summary: text("summary").notNull().default(""),
    before: jsonb("before").$type<unknown>(),
    after: jsonb("after").$type<unknown>(),
  },
  (table) => [
    index("audit_log_at_idx").on(table.at),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const business = pgTable("business", {
  id: integer("id").primaryKey().default(1),
  legalName: text("legal_name").notNull().default(""),
  tradeName: text("trade_name").notNull().default(""),
  gstin: text("gstin").notNull().default(""),
  pan: text("pan").notNull().default(""),
  address: text("address").notNull().default(""),
  stateCode: text("state_code").notNull().default("33"),
  jurisdiction: text("jurisdiction").notNull().default(""),
  registrationType: text("registration_type").$type<RegistrationType>().notNull().default("regular"),
  filingFrequency: text("filing_frequency").$type<FilingFrequency>().notNull().default("monthly"),
  fyStartYear: integer("fy_start_year").notNull().default(2026),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  proprietor: text("proprietor").notNull().default(""),
  invoicePrefix: text("invoice_prefix").notNull().default("DC/"),
  b2clLimitPaise: bigint("b2cl_limit_paise", { mode: "number" }).notNull().default(10000000),
  noItcScheme: boolean("no_itc_scheme").notNull().default(true),
  roundOff: boolean("round_off").notNull().default(true),
  defaultPriceMode: text("default_price_mode").$type<PriceMode>().notNull().default("exclusive"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const taxRates = pgTable(
  "tax_rates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    rateBp: integer("rate_bp").notNull(),
    label: text("label").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("tax_rates_rate_uq").on(table.rateBp)],
);

export const hsnCodes = pgTable(
  "hsn_codes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull(),
    description: text("description").notNull(),
    isService: boolean("is_service").notNull().default(true),
    defaultRateBp: integer("default_rate_bp").notNull().default(500),
    supplyKind: text("supply_kind").$type<SupplyKind>().notNull().default("taxable"),
    uqc: text("uqc").notNull().default("NA"),
    itcAllowed: boolean("itc_allowed").notNull().default(false),
    notes: text("notes").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("hsn_codes_code_uq").on(table.code)],
);

export const importBatches = pgTable(
  "import_batches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").notNull(),
    filename: text("filename").notNull(),
    schemaVersion: text("schema_version").notNull().default(""),
    status: text("status").notNull().default("committed"),
    rowsTotal: integer("rows_total").notNull().default(0),
    rowsImported: integer("rows_imported").notNull().default(0),
    rowsSkipped: integer("rows_skipped").notNull().default(0),
    mapping: jsonb("mapping").$type<Record<string, string>>(),
    errors: jsonb("errors").$type<unknown[]>(),
    createdIds: jsonb("created_ids").$type<Record<string, number[]>>(),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: createdAt(),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  },
  (table) => [index("import_batches_created_at_idx").on(table.createdAt)],
);

export const parties = pgTable(
  "parties",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    kind: text("kind").$type<PartyKind>().notNull(),
    name: text("name").notNull(),
    gstin: text("gstin").notNull().default(""),
    address: text("address").notNull().default(""),
    stateCode: text("state_code").notNull().default("33"),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    active: boolean("active").notNull().default(true),
    importBatchId: bigint("import_batch_id", { mode: "number" }).references(
      () => importBatches.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("parties_kind_name_gstin_uq").on(table.kind, table.name, table.gstin),
    index("parties_kind_idx").on(table.kind),
  ],
);

export const salesDocs = pgTable(
  "sales_docs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    docType: text("doc_type").$type<DocType>().notNull().default("invoice"),
    number: text("number").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    partyId: bigint("party_id", { mode: "number" }).references(() => parties.id, {
      onDelete: "set null",
    }),
    partyName: text("party_name").notNull().default(""),
    partyGstin: text("party_gstin").notNull().default(""),
    partyAddress: text("party_address").notNull().default(""),
    partyStateCode: text("party_state_code").notNull().default("33"),
    placeOfSupply: text("place_of_supply").notNull().default("33"),
    reverseCharge: boolean("reverse_charge").notNull().default(false),
    priceMode: text("price_mode").$type<PriceMode>().notNull().default("exclusive"),
    taxableValuePaise: bigint("taxable_value_paise", { mode: "number" }).notNull().default(0),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull().default(0),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull().default(0),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull().default(0),
    cessPaise: bigint("cess_paise", { mode: "number" }).notNull().default(0),
    roundOffPaise: bigint("round_off_paise", { mode: "number" }).notNull().default(0),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull().default(0),
    notes: text("notes").notNull().default(""),
    status: text("status").$type<DocStatus>().notNull().default("active"),
    createdBy: bigint("created_by", { mode: "number" }),
    originalNumber: text("original_number").notNull().default(""),
    originalDate: date("original_date", { mode: "string" }),
    noteReason: text("note_reason").notNull().default(""),
    isExport: boolean("is_export").notNull().default(false),
    exportWithIgst: boolean("export_with_igst").notNull().default(false),
    section: text("section").notNull().default("b2cs"),
    amendsId: bigint("amends_id", { mode: "number" }).references((): AnyPgColumn => salesDocs.id, {
      onDelete: "set null",
    }),
    amendedById: bigint("amended_by_id", { mode: "number" }),
    amendPeriod: text("amend_period").notNull().default(""),
    orderRef: text("order_ref").notNull().default(""),
    importBatchId: bigint("import_batch_id", { mode: "number" }).references(
      () => importBatches.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("sales_docs_type_number_uq").on(table.docType, table.number),
    index("sales_docs_date_idx").on(table.date),
    index("sales_docs_number_idx").on(table.number),
    index("sales_docs_party_gstin_idx").on(table.partyGstin),
    index("sales_docs_amend_period_idx").on(table.amendPeriod),
  ],
);

export const salesLines = pgTable(
  "sales_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    docId: bigint("doc_id", { mode: "number" })
      .notNull()
      .references(() => salesDocs.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull().default(""),
    hsnSac: text("hsn_sac").notNull().default(""),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("NOS"),
    unitPricePaise: bigint("unit_price_paise", { mode: "number" }).notNull().default(0),
    discountPaise: bigint("discount_paise", { mode: "number" }).notNull().default(0),
    gstRateBp: integer("gst_rate_bp").notNull().default(0),
    cessRateBp: integer("cess_rate_bp").notNull().default(0),
    supplyKind: text("supply_kind").$type<SupplyKind>().notNull().default("taxable"),
    taxableValuePaise: bigint("taxable_value_paise", { mode: "number" }).notNull().default(0),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull().default(0),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull().default(0),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull().default(0),
    cessPaise: bigint("cess_paise", { mode: "number" }).notNull().default(0),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull().default(0),
  },
  (table) => [index("sales_lines_doc_idx").on(table.docId)],
);

export const purchases = pgTable(
  "purchases",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    docType: text("doc_type").$type<DocType>().notNull().default("invoice"),
    number: text("number").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    supplierId: bigint("supplier_id", { mode: "number" }).references(() => parties.id, {
      onDelete: "set null",
    }),
    supplierName: text("supplier_name").notNull().default(""),
    supplierGstin: text("supplier_gstin").notNull().default(""),
    supplierStateCode: text("supplier_state_code").notNull().default("33"),
    placeOfSupply: text("place_of_supply").notNull().default("33"),
    reverseCharge: boolean("reverse_charge").notNull().default(false),
    priceMode: text("price_mode").$type<PriceMode>().notNull().default("exclusive"),
    taxableValuePaise: bigint("taxable_value_paise", { mode: "number" }).notNull().default(0),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull().default(0),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull().default(0),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull().default(0),
    cessPaise: bigint("cess_paise", { mode: "number" }).notNull().default(0),
    roundOffPaise: bigint("round_off_paise", { mode: "number" }).notNull().default(0),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull().default(0),
    notes: text("notes").notNull().default(""),
    status: text("status").$type<DocStatus>().notNull().default("active"),
    createdBy: bigint("created_by", { mode: "number" }),
    originalNumber: text("original_number").notNull().default(""),
    originalDate: date("original_date", { mode: "string" }),
    noteReason: text("note_reason").notNull().default(""),
    category: text("category").$type<PurchaseCategory>().notNull().default("inputs"),
    itcPeriod: text("itc_period").notNull().default(""),
    reconStatus: text("recon_status").$type<ReconStatus>().notNull().default("pending"),
    importBatchId: bigint("import_batch_id", { mode: "number" }).references(
      () => importBatches.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("purchases_supplier_number_uq").on(
      table.supplierGstin,
      table.supplierName,
      table.number,
      table.docType,
    ),
    index("purchases_date_idx").on(table.date),
    index("purchases_itc_period_idx").on(table.itcPeriod),
    index("purchases_supplier_gstin_idx").on(table.supplierGstin),
  ],
);

export const purchaseLines = pgTable(
  "purchase_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    docId: bigint("doc_id", { mode: "number" })
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull().default(""),
    hsnSac: text("hsn_sac").notNull().default(""),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("NOS"),
    unitPricePaise: bigint("unit_price_paise", { mode: "number" }).notNull().default(0),
    discountPaise: bigint("discount_paise", { mode: "number" }).notNull().default(0),
    gstRateBp: integer("gst_rate_bp").notNull().default(0),
    cessRateBp: integer("cess_rate_bp").notNull().default(0),
    supplyKind: text("supply_kind").$type<SupplyKind>().notNull().default("taxable"),
    taxableValuePaise: bigint("taxable_value_paise", { mode: "number" }).notNull().default(0),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull().default(0),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull().default(0),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull().default(0),
    cessPaise: bigint("cess_paise", { mode: "number" }).notNull().default(0),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull().default(0),
    itcEligible: boolean("itc_eligible").notNull().default(false),
    itcReason: text("itc_reason").notNull().default(""),
  },
  (table) => [index("purchase_lines_doc_idx").on(table.docId)],
);

export const itcAdjustments = pgTable(
  "itc_adjustments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    period: text("period").notNull(),
    kind: text("kind").$type<ItcKind>().notNull(),
    rule: text("rule").notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull().default(0),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull().default(0),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull().default(0),
    cessPaise: bigint("cess_paise", { mode: "number" }).notNull().default(0),
    note: text("note").notNull().default(""),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("itc_adjustments_period_idx").on(table.period)],
);

export const gstr2bEntries = pgTable(
  "gstr2b_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    period: text("period").notNull(),
    supplierGstin: text("supplier_gstin").notNull(),
    supplierName: text("supplier_name").notNull().default(""),
    docType: text("doc_type").notNull().default("invoice"),
    number: text("number").notNull(),
    date: date("date", { mode: "string" }),
    taxableValuePaise: bigint("taxable_value_paise", { mode: "number" }).notNull().default(0),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull().default(0),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull().default(0),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull().default(0),
    cessPaise: bigint("cess_paise", { mode: "number" }).notNull().default(0),
    itcAvailable: boolean("itc_available").notNull().default(true),
    reverseCharge: boolean("reverse_charge").notNull().default(false),
    importBatchId: bigint("import_batch_id", { mode: "number" }).references(
      () => importBatches.id,
      { onDelete: "cascade" },
    ),
  },
  (table) => [
    index("gstr2b_period_idx").on(table.period),
    index("gstr2b_supplier_idx").on(table.supplierGstin),
  ],
);

export const returnPeriods = pgTable(
  "return_periods",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    period: text("period").notNull(),
    fy: text("fy").notNull(),
    gstr1Status: text("gstr1_status").$type<ReturnStatus>().notNull().default("open"),
    gstr3bStatus: text("gstr3b_status").$type<ReturnStatus>().notNull().default("open"),
    gstr1Arn: text("gstr1_arn").notNull().default(""),
    gstr1FiledOn: date("gstr1_filed_on", { mode: "string" }),
    gstr3bArn: text("gstr3b_arn").notNull().default(""),
    gstr3bFiledOn: date("gstr3b_filed_on", { mode: "string" }),
    approvedBy: bigint("approved_by", { mode: "number" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    outputTaxPaise: bigint("output_tax_paise", { mode: "number" }).notNull().default(0),
    eligibleItcPaise: bigint("eligible_itc_paise", { mode: "number" }).notNull().default(0),
    netPayablePaise: bigint("net_payable_paise", { mode: "number" }).notNull().default(0),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    paidIgstPaise: bigint("paid_igst_paise", { mode: "number" }).notNull().default(0),
    paidCgstPaise: bigint("paid_cgst_paise", { mode: "number" }).notNull().default(0),
    paidSgstPaise: bigint("paid_sgst_paise", { mode: "number" }).notNull().default(0),
    paidCessPaise: bigint("paid_cess_paise", { mode: "number" }).notNull().default(0),
    interestPaise: bigint("interest_paise", { mode: "number" }).notNull().default(0),
    lateFeePaise: bigint("late_fee_paise", { mode: "number" }).notNull().default(0),
    challanRef: text("challan_ref").notNull().default(""),
    paidOn: date("paid_on", { mode: "string" }),
    locked: boolean("locked").notNull().default(false),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("return_periods_period_uq").on(table.period)],
);

export const documents = pgTable(
  "documents",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: text("entity_type").$type<DocumentEntity>().notNull(),
    entityId: bigint("entity_id", { mode: "number" }).notNull(),
    kind: text("kind").notNull().default("other"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    objectKey: text("object_key").notNull(),
    checksum: text("checksum").notNull().default(""),
    uploadedBy: bigint("uploaded_by", { mode: "number" }).references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("documents_object_key_uq").on(table.objectKey),
    index("documents_entity_idx").on(table.entityType, table.entityId),
  ],
);
