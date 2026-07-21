CREATE TABLE IF NOT EXISTS "test_analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" varchar(50) NOT NULL,
	"user_id" uuid,
	"family_id" uuid,
	"platform" varchar(10),
	"app_version" varchar(20),
	"screen" varchar(100),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo_account" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_analytics_created_idx" ON "test_analytics_events" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_analytics_event_idx" ON "test_analytics_events" ("event_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_analytics_user_idx" ON "test_analytics_events" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "test_analytics_platform_idx" ON "test_analytics_events" ("platform");
