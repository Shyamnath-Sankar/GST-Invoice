CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" bigint,
	"user_email" text DEFAULT '' NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "business" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"trade_name" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"pan" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"state_code" text DEFAULT '33' NOT NULL,
	"jurisdiction" text DEFAULT '' NOT NULL,
	"registration_type" text DEFAULT 'regular' NOT NULL,
	"filing_frequency" text DEFAULT 'monthly' NOT NULL,
	"fy_start_year" integer DEFAULT 2026 NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"proprietor" text DEFAULT '' NOT NULL,
	"invoice_prefix" text DEFAULT 'DC/' NOT NULL,
	"b2cl_limit_paise" bigint DEFAULT 10000000 NOT NULL,
	"no_itc_scheme" boolean DEFAULT true NOT NULL,
	"round_off" boolean DEFAULT true NOT NULL,
	"default_price_mode" text DEFAULT 'exclusive' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"object_key" text NOT NULL,
	"checksum" text DEFAULT '' NOT NULL,
	"uploaded_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gstr2b_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"supplier_gstin" text NOT NULL,
	"supplier_name" text DEFAULT '' NOT NULL,
	"doc_type" text DEFAULT 'invoice' NOT NULL,
	"number" text NOT NULL,
	"date" date,
	"taxable_value_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"itc_available" boolean DEFAULT true NOT NULL,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"import_batch_id" bigint
);
--> statement-breakpoint
CREATE TABLE "hsn_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"is_service" boolean DEFAULT true NOT NULL,
	"default_rate_bp" integer DEFAULT 500 NOT NULL,
	"supply_kind" text DEFAULT 'taxable' NOT NULL,
	"uqc" text DEFAULT 'NA' NOT NULL,
	"itc_allowed" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"schema_version" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'committed' NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"rows_imported" integer DEFAULT 0 NOT NULL,
	"rows_skipped" integer DEFAULT 0 NOT NULL,
	"mapping" jsonb,
	"errors" jsonb,
	"created_ids" jsonb,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rolled_back_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "itc_adjustments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"kind" text NOT NULL,
	"rule" text NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint,
	"email" text NOT NULL,
	"success" boolean NOT NULL,
	"event" text DEFAULT 'login' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"state_code" text DEFAULT '33' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"import_batch_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"doc_id" bigint NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hsn_sac" text DEFAULT '' NOT NULL,
	"qty" numeric(14, 3) DEFAULT '1' NOT NULL,
	"unit" text DEFAULT 'NOS' NOT NULL,
	"unit_price_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"gst_rate_bp" integer DEFAULT 0 NOT NULL,
	"cess_rate_bp" integer DEFAULT 0 NOT NULL,
	"supply_kind" text DEFAULT 'taxable' NOT NULL,
	"taxable_value_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"itc_eligible" boolean DEFAULT false NOT NULL,
	"itc_reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"doc_type" text DEFAULT 'invoice' NOT NULL,
	"number" text NOT NULL,
	"date" date NOT NULL,
	"supplier_id" bigint,
	"supplier_name" text DEFAULT '' NOT NULL,
	"supplier_gstin" text DEFAULT '' NOT NULL,
	"supplier_state_code" text DEFAULT '33' NOT NULL,
	"place_of_supply" text DEFAULT '33' NOT NULL,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"price_mode" text DEFAULT 'exclusive' NOT NULL,
	"taxable_value_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"round_off_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" bigint,
	"original_number" text DEFAULT '' NOT NULL,
	"original_date" date,
	"note_reason" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'inputs' NOT NULL,
	"itc_period" text DEFAULT '' NOT NULL,
	"recon_status" text DEFAULT 'pending' NOT NULL,
	"import_batch_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_periods" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"fy" text NOT NULL,
	"gstr1_status" text DEFAULT 'open' NOT NULL,
	"gstr3b_status" text DEFAULT 'open' NOT NULL,
	"gstr1_arn" text DEFAULT '' NOT NULL,
	"gstr1_filed_on" date,
	"gstr3b_arn" text DEFAULT '' NOT NULL,
	"gstr3b_filed_on" date,
	"approved_by" bigint,
	"approved_at" timestamp with time zone,
	"output_tax_paise" bigint DEFAULT 0 NOT NULL,
	"eligible_itc_paise" bigint DEFAULT 0 NOT NULL,
	"net_payable_paise" bigint DEFAULT 0 NOT NULL,
	"snapshot" jsonb,
	"paid_igst_paise" bigint DEFAULT 0 NOT NULL,
	"paid_cgst_paise" bigint DEFAULT 0 NOT NULL,
	"paid_sgst_paise" bigint DEFAULT 0 NOT NULL,
	"paid_cess_paise" bigint DEFAULT 0 NOT NULL,
	"interest_paise" bigint DEFAULT 0 NOT NULL,
	"late_fee_paise" bigint DEFAULT 0 NOT NULL,
	"challan_ref" text DEFAULT '' NOT NULL,
	"paid_on" date,
	"locked" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_docs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"doc_type" text DEFAULT 'invoice' NOT NULL,
	"number" text NOT NULL,
	"date" date NOT NULL,
	"party_id" bigint,
	"party_name" text DEFAULT '' NOT NULL,
	"party_gstin" text DEFAULT '' NOT NULL,
	"party_address" text DEFAULT '' NOT NULL,
	"party_state_code" text DEFAULT '33' NOT NULL,
	"place_of_supply" text DEFAULT '33' NOT NULL,
	"reverse_charge" boolean DEFAULT false NOT NULL,
	"price_mode" text DEFAULT 'exclusive' NOT NULL,
	"taxable_value_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"round_off_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" bigint,
	"original_number" text DEFAULT '' NOT NULL,
	"original_date" date,
	"note_reason" text DEFAULT '' NOT NULL,
	"is_export" boolean DEFAULT false NOT NULL,
	"export_with_igst" boolean DEFAULT false NOT NULL,
	"section" text DEFAULT 'b2cs' NOT NULL,
	"amends_id" bigint,
	"amended_by_id" bigint,
	"amend_period" text DEFAULT '' NOT NULL,
	"order_ref" text DEFAULT '' NOT NULL,
	"import_batch_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"doc_id" bigint NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"hsn_sac" text DEFAULT '' NOT NULL,
	"qty" numeric(14, 3) DEFAULT '1' NOT NULL,
	"unit" text DEFAULT 'NOS' NOT NULL,
	"unit_price_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"gst_rate_bp" integer DEFAULT 0 NOT NULL,
	"cess_rate_bp" integer DEFAULT 0 NOT NULL,
	"supply_kind" text DEFAULT 'taxable' NOT NULL,
	"taxable_value_paise" bigint DEFAULT 0 NOT NULL,
	"cgst_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_paise" bigint DEFAULT 0 NOT NULL,
	"igst_paise" bigint DEFAULT 0 NOT NULL,
	"cess_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rate_bp" integer NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'accountant' NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gstr2b_entries" ADD CONSTRAINT "gstr2b_entries_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_doc_id_purchases_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_parties_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_docs" ADD CONSTRAINT "sales_docs_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_docs" ADD CONSTRAINT "sales_docs_amends_id_sales_docs_id_fk" FOREIGN KEY ("amends_id") REFERENCES "public"."sales_docs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_docs" ADD CONSTRAINT "sales_docs_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_doc_id_sales_docs_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."sales_docs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_object_key_uq" ON "documents" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "documents_entity_idx" ON "documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "gstr2b_period_idx" ON "gstr2b_entries" USING btree ("period");--> statement-breakpoint
CREATE INDEX "gstr2b_supplier_idx" ON "gstr2b_entries" USING btree ("supplier_gstin");--> statement-breakpoint
CREATE UNIQUE INDEX "hsn_codes_code_uq" ON "hsn_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "import_batches_created_at_idx" ON "import_batches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "itc_adjustments_period_idx" ON "itc_adjustments" USING btree ("period");--> statement-breakpoint
CREATE INDEX "login_history_email_at_idx" ON "login_history" USING btree ("email","at");--> statement-breakpoint
CREATE INDEX "login_history_at_idx" ON "login_history" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "parties_kind_name_gstin_uq" ON "parties" USING btree ("kind","name","gstin");--> statement-breakpoint
CREATE INDEX "parties_kind_idx" ON "parties" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "password_resets_token_uq" ON "password_resets" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "purchase_lines_doc_idx" ON "purchase_lines" USING btree ("doc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_supplier_number_uq" ON "purchases" USING btree ("supplier_gstin","supplier_name","number","doc_type");--> statement-breakpoint
CREATE INDEX "purchases_date_idx" ON "purchases" USING btree ("date");--> statement-breakpoint
CREATE INDEX "purchases_itc_period_idx" ON "purchases" USING btree ("itc_period");--> statement-breakpoint
CREATE INDEX "purchases_supplier_gstin_idx" ON "purchases" USING btree ("supplier_gstin");--> statement-breakpoint
CREATE UNIQUE INDEX "return_periods_period_uq" ON "return_periods" USING btree ("period");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_docs_type_number_uq" ON "sales_docs" USING btree ("doc_type","number");--> statement-breakpoint
CREATE INDEX "sales_docs_date_idx" ON "sales_docs" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sales_docs_number_idx" ON "sales_docs" USING btree ("number");--> statement-breakpoint
CREATE INDEX "sales_docs_party_gstin_idx" ON "sales_docs" USING btree ("party_gstin");--> statement-breakpoint
CREATE INDEX "sales_docs_amend_period_idx" ON "sales_docs" USING btree ("amend_period");--> statement-breakpoint
CREATE INDEX "sales_lines_doc_idx" ON "sales_lines" USING btree ("doc_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_rate_uq" ON "tax_rates" USING btree ("rate_bp");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");