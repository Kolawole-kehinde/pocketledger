-- RBAC data migration.
-- Runs after 0017 has created the RBAC and Ledger base schema.
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
