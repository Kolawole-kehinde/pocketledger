CREATE TYPE "public"."access_token_revocation_reason" AS ENUM('user_logout', 'logout_all', 'session_revoked', 'refresh_token_reuse', 'security_concern', 'account_suspended', 'account_closed', 'role_changed', 'admin_revoked');--> statement-breakpoint
ALTER TYPE "public"."security_event_type" ADD VALUE 'access_token_revoked' BEFORE 'refresh_token_rotated';--> statement-breakpoint
CREATE TABLE "access_token_revocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jti" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"reason" "access_token_revocation_reason" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" varchar(1000),
	"ip_address" "inet"
);
--> statement-breakpoint
ALTER TABLE "access_token_revocations" ADD CONSTRAINT "access_token_revocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_token_revocations" ADD CONSTRAINT "access_token_revocations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_token_revocations_jti_unique" ON "access_token_revocations" USING btree ("jti");--> statement-breakpoint
CREATE INDEX "access_token_revocations_user_id_idx" ON "access_token_revocations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "access_token_revocations_session_id_idx" ON "access_token_revocations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "access_token_revocations_expires_at_idx" ON "access_token_revocations" USING btree ("expires_at");