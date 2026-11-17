CREATE TYPE "public"."account_type" AS ENUM('ASSETS', 'LIABILITY', 'EQUITY', 'EXPENSE', 'REVENUE');--> statement-breakpoint
CREATE TYPE "public"."normal_balance" AS ENUM('CREDIT', 'DEBIT');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_owner_type" AS ENUM('CUSTOMER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."ledger_account_status" AS ENUM('ACTIVE', 'FROZEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."journal_status" AS ENUM('POSTED');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('TRANSFER', 'DEPOSIT', 'WITHDRAWAL', 'PAYMENT', 'FEE', 'REFUND', 'REVERSAL', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."entry_type" AS ENUM('DEBIT', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."financial_hold_status" AS ENUM('ACTIVE', 'PARTIALLY_SETTLED', 'CAPTURED', 'RELEASED', 'SETTLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."hold_operation_type" AS ENUM('CAPTURE', 'RELEASE');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_discrepancy_status" AS ENUM('OPEN', 'INVESTIGATING', 'RESOLVED', 'ACCEPTED');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_discrepancy_subject_type" AS ENUM('LEDGER_ACCOUNT', 'JOURNAL_TRANSACTION', 'BALANCE_PROJECTION', 'JOURNAL_ENTRY_SET');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_discrepancy_type" AS ENUM('BALANCE_MISMATCH', 'DEBIT_CREDIT_IMBALANCE', 'MISSING_BALANCE_PROJECTION', 'ORPHANED_BALANCE_PROJECTION', 'ENTRY_TOTAL_MISMATCH');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_initiator_type" AS ENUM('ADMIN', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_run_status" AS ENUM('RUNNING', 'COMPLETED', 'COMPLETED_WITH_DISCREPANCIES', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_run_type" AS ENUM('FULL', 'SCOPED');--> statement-breakpoint
CREATE TABLE "roles" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" varchar(500) NOT NULL,
	"level" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" varchar(50) NOT NULL,
	"permission" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"account_type" "account_type" NOT NULL,
	"normal_balance" "normal_balance" NOT NULL,
	"parent_account_id" uuid,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_of_accounts_code_unique" UNIQUE("code"),
	CONSTRAINT "chart_of_accounts_no_self_parent_check" CHECK ("chart_of_accounts"."parent_account_id" IS NULL OR "chart_of_accounts"."id" <> "chart_of_accounts"."parent_account_id")
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(3) NOT NULL,
	"name" varchar(100) NOT NULL,
	"minor_unit" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_code_unique" UNIQUE("code"),
	CONSTRAINT "currencies_code_format_check" CHECK ("currencies"."code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "currencies_minor_unit_check" CHECK ("currencies"."minor_unit" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE "ledger_account_balances" (
	"ledger_account_id" uuid PRIMARY KEY NOT NULL,
	"total_debits" numeric(38, 0) DEFAULT '0' NOT NULL,
	"total_credits" numeric(38, 0) DEFAULT '0' NOT NULL,
	"posted_balance" numeric(38, 0) DEFAULT '0' NOT NULL,
	"held_amount" numeric(38, 0) DEFAULT '0' NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"last_entry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_account_balances_total_debits_check" CHECK ("ledger_account_balances"."total_debits" >= 0),
	CONSTRAINT "ledger_account_balances_total_credits_check" CHECK ("ledger_account_balances"."total_credits" >= 0),
	CONSTRAINT "ledger_account_balances_held_amount_check" CHECK ("ledger_account_balances"."held_amount" >= 0),
	CONSTRAINT "ledger_account_balances_version_check" CHECK ("ledger_account_balances"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chart_account_id" uuid NOT NULL,
	"owner_type" "ledger_account_owner_type" NOT NULL,
	"wallet_id" uuid,
	"system_account_definition_id" uuid,
	"currency" varchar(3) NOT NULL,
	"status" "ledger_account_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_accounts_wallet_currency_unique" UNIQUE("wallet_id","currency"),
	CONSTRAINT "ledger_accounts_id_owner_type_unique" UNIQUE("id","owner_type"),
	CONSTRAINT "ledger_accounts_id_currency_unique" UNIQUE("id","currency"),
	CONSTRAINT "ledger_accounts_system_definition_currency_unique" UNIQUE("system_account_definition_id","currency"),
	CONSTRAINT "ledger_accounts_owner_check" CHECK (
        (
          "ledger_accounts"."owner_type" = 'CUSTOMER'
          AND "ledger_accounts"."wallet_id" IS NOT NULL
          AND "ledger_accounts"."system_account_definition_id" IS NULL
        )
        OR
        (
          "ledger_accounts"."owner_type" = 'SYSTEM'
          AND "ledger_accounts"."wallet_id" IS NULL
          AND "ledger_accounts"."system_account_definition_id" IS NOT NULL
        )
      )
);
--> statement-breakpoint
CREATE TABLE "system-account-definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"chart_account_id" uuid NOT NULL,
	"allow_negative_balance" boolean NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "system_account_definitions_code_unique" UNIQUE("code"),
	CONSTRAINT "system_account_definitions_id_chart_account_unique" UNIQUE("id","chart_account_id")
);
--> statement-breakpoint
CREATE TABLE "journal_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference" varchar(40) NOT NULL,
	"transaction_type" "transaction_type" NOT NULL,
	"status" "journal_status" NOT NULL,
	"currency" varchar(3) NOT NULL,
	"description" text,
	"metadata" jsonb,
	"source_module" varchar(50) NOT NULL,
	"source_reference" varchar(150) NOT NULL,
	"posting_purpose" varchar(50) NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_transactions_reference_unique" UNIQUE("reference"),
	CONSTRAINT "journal_transactions_source_operation_unique" UNIQUE("source_module","source_reference","posting_purpose"),
	CONSTRAINT "journal_transactions_id_currency_unique" UNIQUE("id","currency"),
	CONSTRAINT "journal_transactions_reference_not_empty_check" CHECK (length(trim("journal_transactions"."reference")) > 0),
	CONSTRAINT "journal_transactions_source_module_not_empty_check" CHECK (length(trim("journal_transactions"."source_module")) > 0),
	CONSTRAINT "journal_transactions_source_reference_not_empty_check" CHECK (length(trim("journal_transactions"."source_reference")) > 0),
	CONSTRAINT "journal_transactions_posting_purpose_not_empty_check" CHECK (length(trim("journal_transactions"."posting_purpose")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_transaction_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"entry_type" "entry_type" NOT NULL,
	"amount" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"description" text,
	"sequence_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_journal_sequence_unique" UNIQUE("journal_transaction_id","sequence_number"),
	CONSTRAINT "ledger_entries_amount_check" CHECK ("ledger_entries"."amount" > 0),
	CONSTRAINT "ledger_entries_sequence_number_check" CHECK ("ledger_entries"."sequence_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "journal_reversals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"original_journal_id" uuid NOT NULL,
	"reversal_journal_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reason" text NOT NULL,
	"reversed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_reversals_reversal_journal_unique" UNIQUE("reversal_journal_id"),
	CONSTRAINT "journal_reversals_different_journals_check" CHECK ("journal_reversals"."original_journal_id" <> "journal_reversals"."reversal_journal_id"),
	CONSTRAINT "journal_reversals_reason_not_empty_check" CHECK (length(trim("journal_reversals"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "journal_reversal_entry_allocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"journal_reversal_id" uuid NOT NULL,
	"original_entry_id" uuid NOT NULL,
	"reversal_entry_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_reversal_entry_allocations_reversal_original_unique" UNIQUE("journal_reversal_id","original_entry_id"),
	CONSTRAINT "journal_reversal_entry_allocations_reversal_entry_unique" UNIQUE("reversal_entry_id"),
	CONSTRAINT "journal_reversal_entry_allocations_amount_check" CHECK ("journal_reversal_entry_allocations"."amount" > 0),
	CONSTRAINT "journal_reversal_entry_allocations_different_entries_check" CHECK ("journal_reversal_entry_allocations"."original_entry_id" <> "journal_reversal_entry_allocations"."reversal_entry_id")
);
--> statement-breakpoint
CREATE TABLE "financial_holds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"ledger_account_owner_type" "ledger_account_owner_type" DEFAULT 'CUSTOMER' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"amount" bigint NOT NULL,
	"captured_amount" bigint DEFAULT 0 NOT NULL,
	"released_amount" bigint DEFAULT 0 NOT NULL,
	"status" "financial_hold_status" DEFAULT 'ACTIVE' NOT NULL,
	"reference" varchar(100) NOT NULL,
	"source_module" varchar(50) NOT NULL,
	"source_reference" varchar(150) NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"expires_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_holds_reference_unique" UNIQUE("reference"),
	CONSTRAINT "financial_holds_source_operation_unique" UNIQUE("source_module","source_reference"),
	CONSTRAINT "financial_holds_id_currency_unique" UNIQUE("id","currency"),
	CONSTRAINT "financial_holds_customer_owner_type_check" CHECK ("financial_holds"."ledger_account_owner_type" = 'CUSTOMER'),
	CONSTRAINT "financial_holds_amount_check" CHECK ("financial_holds"."amount" > 0),
	CONSTRAINT "financial_holds_captured_amount_check" CHECK (
        "financial_holds"."captured_amount" >= 0
        AND "financial_holds"."captured_amount" <= "financial_holds"."amount"
      ),
	CONSTRAINT "financial_holds_released_amount_check" CHECK (
        "financial_holds"."released_amount" >= 0
        AND "financial_holds"."released_amount" <=
          "financial_holds"."amount" - "financial_holds"."captured_amount"
      ),
	CONSTRAINT "financial_holds_status_amount_consistency_check" CHECK (
        (
          "financial_holds"."status" = 'ACTIVE'
          AND "financial_holds"."captured_amount" = 0
          AND "financial_holds"."released_amount" = 0
        )
        OR
        (
          "financial_holds"."status" = 'PARTIALLY_SETTLED'
          AND (
            "financial_holds"."captured_amount" > 0
            OR "financial_holds"."released_amount" > 0
          )
          AND "financial_holds"."released_amount" <
            "financial_holds"."amount" - "financial_holds"."captured_amount"
        )
        OR
        (
          "financial_holds"."status" = 'CAPTURED'
          AND "financial_holds"."captured_amount" = "financial_holds"."amount"
          AND "financial_holds"."released_amount" = 0
        )
        OR
        (
          "financial_holds"."status" = 'RELEASED'
          AND "financial_holds"."captured_amount" = 0
          AND "financial_holds"."released_amount" = "financial_holds"."amount"
        )
        OR
        (
          "financial_holds"."status" = 'SETTLED'
          AND "financial_holds"."captured_amount" > 0
          AND "financial_holds"."released_amount" > 0
          AND "financial_holds"."released_amount" =
            "financial_holds"."amount" - "financial_holds"."captured_amount"
        )
        OR
        (
          "financial_holds"."status" = 'EXPIRED'
          AND "financial_holds"."released_amount" > 0
          AND "financial_holds"."released_amount" =
            "financial_holds"."amount" - "financial_holds"."captured_amount"
        )
      ),
	CONSTRAINT "financial_holds_reference_not_empty_check" CHECK (length(trim("financial_holds"."reference")) > 0),
	CONSTRAINT "financial_holds_source_module_not_empty_check" CHECK (length(trim("financial_holds"."source_module")) > 0),
	CONSTRAINT "financial_holds_source_reference_not_empty_check" CHECK (length(trim("financial_holds"."source_reference")) > 0),
	CONSTRAINT "financial_holds_reason_not_empty_check" CHECK (length(trim("financial_holds"."reason")) > 0),
	CONSTRAINT "financial_holds_expiry_after_creation_check" CHECK ("financial_holds"."expires_at" IS NULL OR "financial_holds"."expires_at" > "financial_holds"."created_at")
);
--> statement-breakpoint
CREATE TABLE "hold_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hold_id" uuid NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reference" varchar(100) NOT NULL,
	"operation_type" "hold_operation_type" NOT NULL,
	"amount" bigint NOT NULL,
	"sequence_number" integer NOT NULL,
	"journal_transaction_id" uuid,
	"performed_by" uuid,
	"reason" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hold_operations_reference_unique" UNIQUE("reference"),
	CONSTRAINT "hold_operations_hold_sequence_unique" UNIQUE("hold_id","sequence_number"),
	CONSTRAINT "hold_operations_amount_check" CHECK ("hold_operations"."amount" > 0),
	CONSTRAINT "hold_operations_sequence_number_check" CHECK ("hold_operations"."sequence_number" > 0),
	CONSTRAINT "hold_operations_journal_relationship_check" CHECK (
        (
          "hold_operations"."operation_type" = 'CAPTURE'
          AND "hold_operations"."journal_transaction_id" IS NOT NULL
        )
        OR
        (
          "hold_operations"."operation_type" = 'RELEASE'
          AND "hold_operations"."journal_transaction_id" IS NULL
        )
      ),
	CONSTRAINT "hold_operations_reference_not_empty_check" CHECK (length(trim("hold_operations"."reference")) > 0),
	CONSTRAINT "hold_operations_reason_not_empty_check" CHECK (length(trim("hold_operations"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_reconciliation_discrepancies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference" varchar(100) NOT NULL,
	"reconciliation_run_id" uuid NOT NULL,
	"ledger_account_id" uuid,
	"subject_type" "reconciliation_discrepancy_subject_type" NOT NULL,
	"subject_reference" varchar(150) NOT NULL,
	"discrepancy_type" "reconciliation_discrepancy_type" NOT NULL,
	"expected_value" numeric(38, 0),
	"actual_value" numeric(38, 0),
	"difference" numeric(38, 0),
	"status" "reconciliation_discrepancy_status" DEFAULT 'OPEN' NOT NULL,
	"description" text NOT NULL,
	"resolution_reason" text,
	"resolved_by" uuid,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb,
	CONSTRAINT "ledger_reconciliation_discrepancies_reference_unique" UNIQUE("reference"),
	CONSTRAINT "ledger_reconciliation_discrepancies_reference_not_empty_check" CHECK (length(trim("ledger_reconciliation_discrepancies"."reference")) > 0),
	CONSTRAINT "ledger_reconciliation_discrepancies_subject_reference_not_empty_check" CHECK (length(trim("ledger_reconciliation_discrepancies"."subject_reference")) > 0),
	CONSTRAINT "ledger_reconciliation_discrepancies_subject_check" CHECK (
        (
          "ledger_reconciliation_discrepancies"."subject_type" = 'LEDGER_ACCOUNT'
          AND "ledger_reconciliation_discrepancies"."ledger_account_id" IS NOT NULL
        )
        OR
        (
          "ledger_reconciliation_discrepancies"."subject_type" <> 'LEDGER_ACCOUNT'
          AND "ledger_reconciliation_discrepancies"."ledger_account_id" IS NULL
        )
      ),
	CONSTRAINT "ledger_reconciliation_discrepancies_description_not_empty_check" CHECK (length(trim("ledger_reconciliation_discrepancies"."description")) > 0),
	CONSTRAINT "ledger_reconciliation_discrepancies_values_check" CHECK (
        (
          "ledger_reconciliation_discrepancies"."expected_value" IS NULL
          AND "ledger_reconciliation_discrepancies"."actual_value" IS NULL
          AND "ledger_reconciliation_discrepancies"."difference" IS NULL
        )
        OR
        (
          "ledger_reconciliation_discrepancies"."expected_value" IS NOT NULL
          AND "ledger_reconciliation_discrepancies"."actual_value" IS NOT NULL
          AND "ledger_reconciliation_discrepancies"."difference" IS NOT NULL
        )
      ),
	CONSTRAINT "ledger_reconciliation_discrepancies_resolution_check" CHECK (
        (
          "ledger_reconciliation_discrepancies"."status" IN ('OPEN', 'INVESTIGATING')
          AND "ledger_reconciliation_discrepancies"."resolved_at" IS NULL
          AND "ledger_reconciliation_discrepancies"."resolution_reason" IS NULL
        )
        OR
        (
          "ledger_reconciliation_discrepancies"."status" IN ('RESOLVED', 'ACCEPTED')
          AND "ledger_reconciliation_discrepancies"."resolved_at" IS NOT NULL
          AND "ledger_reconciliation_discrepancies"."resolution_reason" IS NOT NULL
          AND length(trim("ledger_reconciliation_discrepancies"."resolution_reason")) > 0
        )
      ),
	CONSTRAINT "ledger_reconciliation_discrepancies_resolution_time_check" CHECK (
        "ledger_reconciliation_discrepancies"."resolved_at" IS NULL
        OR "ledger_reconciliation_discrepancies"."resolved_at" >= "ledger_reconciliation_discrepancies"."detected_at"
      )
);
--> statement-breakpoint
CREATE TABLE "ledger_reconciliation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"reference" varchar(100) NOT NULL,
	"run_type" "reconciliation_run_type" NOT NULL,
	"status" "reconciliation_run_status" DEFAULT 'RUNNING' NOT NULL,
	"initiator_type" "reconciliation_initiator_type" NOT NULL,
	"initiated_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"accounts_checked" integer DEFAULT 0 NOT NULL,
	"discrepancies_found" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_reconciliation_runs_reference_unique" UNIQUE("reference"),
	CONSTRAINT "ledger_reconciliation_runs_reference_not_empty_check" CHECK (length(trim("ledger_reconciliation_runs"."reference")) > 0),
	CONSTRAINT "ledger_reconciliation_runs_accounts_checked_check" CHECK ("ledger_reconciliation_runs"."accounts_checked" >= 0),
	CONSTRAINT "ledger_reconciliation_runs_discrepancies_found_check" CHECK ("ledger_reconciliation_runs"."discrepancies_found" >= 0),
	CONSTRAINT "ledger_reconciliation_runs_initiator_check" CHECK (
        (
          "ledger_reconciliation_runs"."initiator_type" = 'ADMIN'
          AND "ledger_reconciliation_runs"."initiated_by" IS NOT NULL
        )
        OR
        (
          "ledger_reconciliation_runs"."initiator_type" = 'SYSTEM'
          AND "ledger_reconciliation_runs"."initiated_by" IS NULL
        )
      ),
	CONSTRAINT "ledger_reconciliation_runs_completion_check" CHECK (
        (
          "ledger_reconciliation_runs"."status" = 'RUNNING'
          AND "ledger_reconciliation_runs"."completed_at" IS NULL
          AND "ledger_reconciliation_runs"."error_code" IS NULL
          AND "ledger_reconciliation_runs"."error_message" IS NULL
        )
        OR
        (
          "ledger_reconciliation_runs"."status" = 'COMPLETED'
          AND "ledger_reconciliation_runs"."completed_at" IS NOT NULL
          AND "ledger_reconciliation_runs"."discrepancies_found" = 0
          AND "ledger_reconciliation_runs"."error_code" IS NULL
        )
        OR
        (
          "ledger_reconciliation_runs"."status" = 'COMPLETED_WITH_DISCREPANCIES'
          AND "ledger_reconciliation_runs"."completed_at" IS NOT NULL
          AND "ledger_reconciliation_runs"."discrepancies_found" > 0
          AND "ledger_reconciliation_runs"."error_code" IS NULL
        )
        OR
        (
          "ledger_reconciliation_runs"."status" = 'FAILED'
          AND "ledger_reconciliation_runs"."completed_at" IS NOT NULL
          AND "ledger_reconciliation_runs"."error_code" IS NOT NULL
          AND length(trim("ledger_reconciliation_runs"."error_code")) > 0
        )
      ),
	CONSTRAINT "ledger_reconciliation_runs_completion_time_check" CHECK (
        "ledger_reconciliation_runs"."completed_at" IS NULL
        OR "ledger_reconciliation_runs"."completed_at" >= "ledger_reconciliation_runs"."started_at"
      )
);
--> statement-breakpoint
CREATE TABLE "ledger_reconciliation_run_accounts" (
	"reconciliation_run_id" uuid NOT NULL,
	"ledger_account_id" uuid NOT NULL,
	"included_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_reconciliation_run_accounts_pk" PRIMARY KEY("reconciliation_run_id","ledger_account_id")
);
--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("parent_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_account_balances" ADD CONSTRAINT "ledger_account_balances_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_chart_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("chart_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_system_definition_chart_account_fk" FOREIGN KEY ("system_account_definition_id","chart_account_id") REFERENCES "public"."system-account-definitions"("id","chart_account_id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "system-account-definitions" ADD CONSTRAINT "system-account-definitions_chart_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("chart_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "journal_transactions" ADD CONSTRAINT "journal_transactions_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_journal_currency_fk" FOREIGN KEY ("journal_transaction_id","currency") REFERENCES "public"."journal_transactions"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_currency_fk" FOREIGN KEY ("ledger_account_id","currency") REFERENCES "public"."ledger_accounts"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "journal_reversals" ADD CONSTRAINT "journal_reversals_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "journal_reversals" ADD CONSTRAINT "journal_reversals_original_journal_currency_fk" FOREIGN KEY ("original_journal_id","currency") REFERENCES "public"."journal_transactions"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "journal_reversals" ADD CONSTRAINT "journal_reversals_reversal_journal_currency_fk" FOREIGN KEY ("reversal_journal_id","currency") REFERENCES "public"."journal_transactions"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "journal_reversal_entry_allocations" ADD CONSTRAINT "journal_reversal_entry_allocations_journal_reversal_id_journal_reversals_id_fk" FOREIGN KEY ("journal_reversal_id") REFERENCES "public"."journal_reversals"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "journal_reversal_entry_allocations" ADD CONSTRAINT "journal_reversal_entry_allocations_original_entry_id_ledger_entries_id_fk" FOREIGN KEY ("original_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "journal_reversal_entry_allocations" ADD CONSTRAINT "journal_reversal_entry_allocations_reversal_entry_id_ledger_entries_id_fk" FOREIGN KEY ("reversal_entry_id") REFERENCES "public"."ledger_entries"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "financial_holds" ADD CONSTRAINT "financial_holds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "financial_holds" ADD CONSTRAINT "financial_holds_customer_account_fk" FOREIGN KEY ("ledger_account_id","ledger_account_owner_type") REFERENCES "public"."ledger_accounts"("id","owner_type") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "financial_holds" ADD CONSTRAINT "financial_holds_account_currency_fk" FOREIGN KEY ("ledger_account_id","currency") REFERENCES "public"."ledger_accounts"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "hold_operations" ADD CONSTRAINT "hold_operations_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "hold_operations" ADD CONSTRAINT "hold_operations_hold_currency_fk" FOREIGN KEY ("hold_id","currency") REFERENCES "public"."financial_holds"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "hold_operations" ADD CONSTRAINT "hold_operations_journal_currency_fk" FOREIGN KEY ("journal_transaction_id","currency") REFERENCES "public"."journal_transactions"("id","currency") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_reconciliation_discrepancies" ADD CONSTRAINT "ledger_reconciliation_discrepancies_reconciliation_run_id_ledger_reconciliation_runs_id_fk" FOREIGN KEY ("reconciliation_run_id") REFERENCES "public"."ledger_reconciliation_runs"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_reconciliation_discrepancies" ADD CONSTRAINT "ledger_reconciliation_discrepancies_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_reconciliation_discrepancies" ADD CONSTRAINT "ledger_reconciliation_discrepancies_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_reconciliation_runs" ADD CONSTRAINT "ledger_reconciliation_runs_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_reconciliation_run_accounts" ADD CONSTRAINT "ledger_reconciliation_run_accounts_reconciliation_run_id_ledger_reconciliation_runs_id_fk" FOREIGN KEY ("reconciliation_run_id") REFERENCES "public"."ledger_reconciliation_runs"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "ledger_reconciliation_run_accounts" ADD CONSTRAINT "ledger_reconciliation_run_accounts_ledger_account_id_ledger_accounts_id_fk" FOREIGN KEY ("ledger_account_id") REFERENCES "public"."ledger_accounts"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_label_unique" ON "roles" USING btree ("label");--> statement-breakpoint
CREATE INDEX "user_roles_role_id_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission");--> statement-breakpoint
CREATE INDEX "ledger_accounts_chart_account_idx" ON "ledger_accounts" USING btree ("chart_account_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_created_idx" ON "ledger_entries" USING btree ("ledger_account_id","created_at","id");--> statement-breakpoint
CREATE INDEX "journal_reversals_original_journal_idx" ON "journal_reversals" USING btree ("original_journal_id");--> statement-breakpoint
CREATE INDEX "journal_reversal_entry_allocations_original_entry_idx" ON "journal_reversal_entry_allocations" USING btree ("original_entry_id");--> statement-breakpoint
CREATE INDEX "financial_holds_account_created_idx" ON "financial_holds" USING btree ("ledger_account_id","created_at");--> statement-breakpoint
CREATE INDEX "financial_holds_expiry_idx" ON "financial_holds" USING btree ("expires_at") WHERE "financial_holds"."status" IN ('ACTIVE', 'PARTIALLY_SETTLED');--> statement-breakpoint
CREATE INDEX "hold_operations_hold_created_idx" ON "hold_operations" USING btree ("hold_id","created_at");--> statement-breakpoint
CREATE INDEX "hold_operations_journal_transaction_idx" ON "hold_operations" USING btree ("journal_transaction_id");--> statement-breakpoint
CREATE INDEX "ledger_reconciliation_discrepancies_run_idx" ON "ledger_reconciliation_discrepancies" USING btree ("reconciliation_run_id");--> statement-breakpoint
CREATE INDEX "ledger_reconciliation_discrepancies_account_idx" ON "ledger_reconciliation_discrepancies" USING btree ("ledger_account_id");--> statement-breakpoint
CREATE INDEX "ledger_reconciliation_discrepancies_status_detected_idx" ON "ledger_reconciliation_discrepancies" USING btree ("status","detected_at");--> statement-breakpoint
CREATE INDEX "ledger_reconciliation_discrepancies_type_idx" ON "ledger_reconciliation_discrepancies" USING btree ("discrepancy_type");--> statement-breakpoint
CREATE INDEX "ledger_reconciliation_runs_status_started_idx" ON "ledger_reconciliation_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "ledger_reconciliation_run_accounts_account_idx" ON "ledger_reconciliation_run_accounts" USING btree ("ledger_account_id");