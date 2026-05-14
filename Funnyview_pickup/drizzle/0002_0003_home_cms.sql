CREATE TYPE "public"."home_section_event_type" AS ENUM('impression', 'click', 'conversion');--> statement-breakpoint
CREATE TYPE "public"."home_section_kind" AS ENUM('hero', 'product_grid', 'category_chips', 'banner_strip', 'countdown', 'brand_story');--> statement-breakpoint
CREATE TABLE "home_section_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"event_type" "home_section_event_type" NOT NULL,
	"user_id" uuid,
	"session_id" text,
	"variant" text,
	"reference_type" text,
	"reference_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "home_section_kind" NOT NULL,
	"title" text,
	"config" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"variant" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "home_section_events" ADD CONSTRAINT "home_section_events_section_id_home_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."home_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_section_events" ADD CONSTRAINT "home_section_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_sections" ADD CONSTRAINT "home_sections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hse_section_event_idx" ON "home_section_events" USING btree ("section_id","event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "hse_occurred_at_idx" ON "home_section_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "home_sections_active_idx" ON "home_sections" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "home_sections_kind_idx" ON "home_sections" USING btree ("kind");