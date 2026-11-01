ALTER TABLE "inbox_events" ADD COLUMN "aggregate_type" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_events" ADD COLUMN "aggregate_id" varchar(255) NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_events" ADD COLUMN "payload" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "inbox_events" ADD COLUMN "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "inbox_events" ADD COLUMN "occurred_at" timestamp with time zone NOT NULL;