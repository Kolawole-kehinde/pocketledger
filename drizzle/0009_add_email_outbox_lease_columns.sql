ALTER TABLE "email_outbox" ADD COLUMN "max_attempts" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "locked_by" varchar(255);--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "email_outbox_status_lease_expires_at_idx" ON "email_outbox" USING btree ("status","lease_expires_at");