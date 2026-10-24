CREATE TYPE "public"."login_failure_reason" AS ENUM('invalid_otp', 'otp_expired', 'otp_already_used', 'too_many_attempts', 'rate_limited', 'account_unavailable', 'session_creation_failed');--> statement-breakpoint
CREATE TYPE "public"."security_event_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."security_event_type" AS ENUM('otp_requested', 'otp_verification_failed', 'login_succeeded', 'login_failed', 'session_created', 'session_revoked', 'refresh_token_rotated', 'refresh_token_reuse_detected', 'rate_limit_exceeded', 'account_suspended', 'account_reactivated', 'suspicious_activity_detected');--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"email" varchar(255),
	"success" boolean NOT NULL,
	"failure_reason" "login_failure_reason",
	"ip_address" "inet",
	"user_agent" varchar(1000),
	"country" varchar(100),
	"city" varchar(100),
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"type" "security_event_type" NOT NULL,
	"severity" "security_event_severity" DEFAULT 'medium' NOT NULL,
	"ip_address" "inet",
	"user_agent" varchar(1000),
	"country" varchar(100),
	"city" varchar(100),
	"metadata" jsonb,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_attempts_user_id_idx" ON "login_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_address_idx" ON "login_attempts" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "login_attempts_created_at_idx" ON "login_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "security_events_user_id_idx" ON "security_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_events_type_idx" ON "security_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "security_events_severity_idx" ON "security_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "security_events_created_at_idx" ON "security_events" USING btree ("created_at");