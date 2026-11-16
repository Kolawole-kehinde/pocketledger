--> statement-breakpoint
-- RBAC: normalized roles, user-role assignments, and role-permission mappings.
CREATE TABLE IF NOT EXISTS "roles" (
  "id" varchar(50) PRIMARY KEY NOT NULL,
  "label" varchar(100) NOT NULL,
  "description" varchar(500) NOT NULL,
  "level" integer NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_label_unique" ON "roles" USING btree ("label");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_roles" (
  "user_id" uuid NOT NULL,
  "role_id" varchar(50) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permissions" (
  "role_id" varchar(50) NOT NULL,
  "permission" varchar(100) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk"
    FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk"
    FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_roles_role_id_idx" ON "user_roles" USING btree ("role_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission");
--> statement-breakpoint

-- Seed predefined roles (preserve labels, descriptions, levels, default flag).
INSERT INTO "roles" ("id","label","description","level","is_default")
VALUES
  ('customer','Customer','Owns a PocketLedger account and manages their own profile and sessions.',10,true),
  ('support','Support','Read-only access to customer accounts and security events for troubleshooting.',20,false),
  ('admin','Administrator','Full platform administration, including users, roles, permissions and security events.',30,false)
ON CONFLICT ("id") DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "level" = EXCLUDED."level",
  "is_default" = EXCLUDED."is_default",
  "updated_at" = now();
--> statement-breakpoint

-- Seed role-permission mappings from the existing permission matrix.
INSERT INTO "role_permissions" ("role_id","permission") VALUES
  ('customer','profile:read'),
  ('customer','profile:update'),
  ('customer','sessions:read'),
  ('customer','sessions:revoke'),
  ('support','profile:read'),
  ('support','profile:update'),
  ('support','sessions:read'),
  ('support','sessions:revoke'),
  ('support','users:read'),
  ('support','users:permissions:read'),
  ('support','security-events:read'),
  ('admin','profile:read'),
  ('admin','profile:update'),
  ('admin','users:read'),
  ('admin','users:update'),
  ('admin','users:role:update'),
  ('admin','users:status:update'),
  ('admin','users:permissions:read'),
  ('admin','users:permissions:manage'),
  ('admin','sessions:read'),
  ('admin','sessions:revoke'),
  ('admin','security-events:read'),
  ('admin','security-events:resolve')
ON CONFLICT ("role_id","permission") DO NOTHING;
--> statement-breakpoint

-- Migrate existing single-role assignments from users.role into user_roles.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'role'
  ) THEN
    INSERT INTO "user_roles" ("user_id","role_id")
    SELECT u."id", u."role"::text
    FROM "users" u
    ON CONFLICT ("user_id","role_id") DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint

-- Ensure every existing user has at least the default customer role.
INSERT INTO "user_roles" ("user_id","role_id")
SELECT u."id", 'customer'
FROM "users" u
WHERE NOT EXISTS (
  SELECT 1 FROM "user_roles" ur WHERE ur."user_id" = u."id"
)
ON CONFLICT ("user_id","role_id") DO NOTHING;
--> statement-breakpoint

-- Remove legacy single-role column only after successful backfill.
ALTER TABLE "users" DROP COLUMN IF EXISTS "role";
--> statement-breakpoint

-- Drop legacy enum type if present and no longer referenced.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    DROP TYPE "public"."user_role";
  END IF;
EXCEPTION WHEN dependent_objects_still_exist THEN NULL; END $$;
--> statement-breakpoint

-- Ledger schema corrections: referenced unique constraint for composite FK.
DO $$ BEGIN
  ALTER TABLE "system-account-definitions"
    ADD CONSTRAINT "system_account_definitions_id_chart_account_unique"
    UNIQUE ("id","chart_account_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;
--> statement-breakpoint

-- Ledger schema corrections: user foreign keys (nullable, ON DELETE/UPDATE RESTRICT).
DO $$ BEGIN
  ALTER TABLE "journal_reversals"
    ADD CONSTRAINT "journal_reversals_reversed_by_users_id_fk"
    FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "financial_holds"
    ADD CONSTRAINT "financial_holds_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "hold_operations"
    ADD CONSTRAINT "hold_operations_performed_by_users_id_fk"
    FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ledger_reconciliation_runs"
    ADD CONSTRAINT "ledger_reconciliation_runs_initiated_by_users_id_fk"
    FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ledger_reconciliation_discrepancies"
    ADD CONSTRAINT "ledger_reconciliation_discrepancies_resolved_by_users_id_fk"
    FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
