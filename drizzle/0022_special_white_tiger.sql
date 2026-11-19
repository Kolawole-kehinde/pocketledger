ALTER TYPE "public"."journal_status" RENAME TO "journal_status_old";--> statement-breakpoint
CREATE TYPE "public"."journal_status" AS ENUM('DRAFT', 'POSTED');--> statement-breakpoint
ALTER TABLE "journal_transactions" ALTER COLUMN "status" TYPE "public"."journal_status" USING "status"::text::"public"."journal_status";--> statement-breakpoint
DROP TYPE "public"."journal_status_old";
