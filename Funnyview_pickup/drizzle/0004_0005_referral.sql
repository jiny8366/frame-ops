CREATE TABLE "referral_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referee_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"reward_amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"accrued_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referrer_id_customers_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_referee_id_customers_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_rewards" ADD CONSTRAINT "referral_rewards_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "referral_rewards_order_unique" ON "referral_rewards" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "referral_rewards_referrer_idx" ON "referral_rewards" USING btree ("referrer_id","status");--> statement-breakpoint
CREATE INDEX "referral_rewards_referee_idx" ON "referral_rewards" USING btree ("referee_id");