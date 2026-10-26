ALTER TABLE "outbox_events" ADD COLUMN "aggregate_sequence" bigint;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_sequence_idx" ON "outbox_events" USING btree ("aggregate_type","aggregate_id","aggregate_sequence");