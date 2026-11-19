ALTER TABLE "journal_transactions" ALTER COLUMN "status" SET DEFAULT 'DRAFT';--> statement-breakpoint
ALTER TABLE "journal_transactions" ALTER COLUMN "posted_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_transactions" ADD CONSTRAINT "journal_transactions_status_posted_at_check" CHECK (
  ("status" = 'DRAFT' AND "posted_at" IS NULL)
  OR
  ("status" = 'POSTED' AND "posted_at" IS NOT NULL)
);
