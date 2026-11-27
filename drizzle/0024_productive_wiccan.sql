
CREATE TYPE "public"."ledger_account_purpose" AS ENUM(
  'SPENDABLE_WALLET',
  'LOCKED_SAVINGS',
  'SYSTEM_CLEARING',
  'SYSTEM_REVENUE',
  'SYSTEM_CASH'
);
--> statement-breakpoint

ALTER TABLE "ledger_accounts"
ADD COLUMN "account_purpose" "ledger_account_purpose" NOT NULL;
--> statement-breakpoint

ALTER TABLE "system-account-definitions"
ADD COLUMN "account_purpose" "ledger_account_purpose" NOT NULL;
--> statement-breakpoint

-- Create UNIQUE before the composite FOREIGN KEY.
ALTER TABLE "system-account-definitions"
ADD CONSTRAINT "system_account_definitions_id_purpose_unique"
UNIQUE("id", "account_purpose");
--> statement-breakpoint

ALTER TABLE "ledger_accounts"
ADD CONSTRAINT "ledger_accounts_system_definition_purpose_fk"
FOREIGN KEY ("system_account_definition_id", "account_purpose")
REFERENCES "public"."system-account-definitions"("id", "account_purpose")
ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint

ALTER TABLE "ledger_accounts"
ADD CONSTRAINT "ledger_accounts_owner_purpose_check"
CHECK (
  (
    "ledger_accounts"."owner_type" = 'CUSTOMER'
    AND "ledger_accounts"."account_purpose" IN (
      'SPENDABLE_WALLET',
      'LOCKED_SAVINGS'
    )
  )
  OR
  (
    "ledger_accounts"."owner_type" = 'SYSTEM'
    AND "ledger_accounts"."account_purpose" IN (
      'SYSTEM_CLEARING',
      'SYSTEM_REVENUE',
      'SYSTEM_CASH'
    )
  )
);
--> statement-breakpoint

ALTER TABLE "system-account-definitions"
ADD CONSTRAINT "system_account_definitions_purpose_check"
CHECK (
  "system-account-definitions"."account_purpose" IN (
    'SYSTEM_CLEARING',
    'SYSTEM_REVENUE',
    'SYSTEM_CASH'
  )
);
