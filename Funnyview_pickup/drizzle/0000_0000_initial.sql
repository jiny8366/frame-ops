CREATE TYPE "public"."eye_side" AS ENUM('left', 'right', 'both');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."inventory_movement_type" AS ENUM('inbound', 'outbound', 'reserve', 'release', 'adjust', 'return');--> statement-breakpoint
CREATE TYPE "public"."lens_type" AS ENUM('spherical', 'toric', 'multifocal', 'color', 'circle');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('app', 'sms', 'kakao', 'email');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'failed', 'read');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('order_received', 'order_shipped', 'order_arrived', 'pickup_ready', 'pickup_completed', 'low_stock');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'accepted', 'picking', 'shipped', 'arrived', 'ready', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('card', 'cash', 'bank_transfer', 'point', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'completed', 'failed', 'refunded', 'partial_refund');--> statement-breakpoint
CREATE TYPE "public"."payment_venue" AS ENUM('online', 'store');--> statement-breakpoint
CREATE TYPE "public"."replacement_cycle" AS ENUM('1day', '2week', '1month', '3month', '6month', '1year');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'warehouse_staff', 'store_staff', 'admin');--> statement-breakpoint
CREATE TABLE "customer_prescriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"eye_side" "eye_side" NOT NULL,
	"sphere" numeric(4, 2) NOT NULL,
	"cylinder" numeric(4, 2),
	"axis" integer,
	"add_power" numeric(4, 2),
	"source" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"gender" "gender",
	"birth_date" date,
	"phone" text NOT NULL,
	"postal_code" text,
	"address_line1" text,
	"address_line2" text,
	"referrer_code" text,
	"referred_by_id" uuid,
	"referred_by_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"phone" text NOT NULL,
	"password_hash" text,
	"role" "user_role" NOT NULL,
	"store_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"postal_code" text,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"kakao_map_url" text,
	"naver_map_url" text,
	"tmap_url" text,
	"business_hours" jsonb,
	"business_number" text,
	"representative_name" text,
	"commission_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lens_barcodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"barcode" text NOT NULL,
	"barcode_type" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lens_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lens_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"sphere" numeric(4, 2) NOT NULL,
	"cylinder" numeric(4, 2),
	"axis" integer,
	"add_power" numeric(4, 2),
	"price_override" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_code" text NOT NULL,
	"brand" text NOT NULL,
	"name" text NOT NULL,
	"lens_type" "lens_type" NOT NULL,
	"replacement_cycle" "replacement_cycle" NOT NULL,
	"base_curve" numeric(4, 2),
	"diameter" numeric(4, 2),
	"water_content" numeric(5, 2),
	"material" text,
	"pieces_per_box" integer DEFAULT 1 NOT NULL,
	"sphere_min" numeric(4, 2),
	"sphere_max" numeric(4, 2),
	"sphere_step" numeric(4, 2) DEFAULT '0.25',
	"cylinder_min" numeric(4, 2),
	"cylinder_max" numeric(4, 2),
	"cylinder_step" numeric(4, 2) DEFAULT '0.25',
	"axis_step" integer DEFAULT 10,
	"price" integer NOT NULL,
	"cost" integer,
	"image_url" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"quantity_reserved" integer DEFAULT 0 NOT NULL,
	"safety_stock" integer DEFAULT 0 NOT NULL,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"location" text,
	"last_counted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_on_hand_non_negative" CHECK ("inventory"."quantity_on_hand" >= 0),
	CONSTRAINT "inventory_reserved_non_negative" CHECK ("inventory"."quantity_reserved" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"movement_type" "inventory_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"note" text,
	"performed_by" uuid,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"eye_side" "eye_side" NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"line_total" integer NOT NULL,
	"lens_name" text NOT NULL,
	"lens_brand" text NOT NULL,
	"sphere" numeric(4, 2) NOT NULL,
	"cylinder" numeric(4, 2),
	"axis" integer,
	"add_power" numeric(4, 2),
	"sku_snapshot" text NOT NULL,
	"barcode_snapshot" text,
	"unit_cost" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"changed_by" uuid,
	"note" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"pickup_store_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"subtotal" integer NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL,
	"is_paid" integer DEFAULT 0 NOT NULL,
	"customer_note" text,
	"internal_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"picking_at" timestamp with time zone,
	"shipped_at" timestamp with time zone,
	"arrived_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_total_non_negative" CHECK ("orders"."total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"store_id" uuid,
	"amount" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"venue" "payment_venue" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"pg_provider" text,
	"pg_transaction_id" text,
	"pg_approval_number" text,
	"pg_raw" jsonb,
	"paid_at" timestamp with time zone,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"refunded_at" timestamp with time zone,
	"collected_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"notification_type" "notification_type" NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"payload" jsonb,
	"reference_type" text,
	"reference_id" uuid,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_prescriptions" ADD CONSTRAINT "customer_prescriptions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_referred_by_id_customers_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_barcodes" ADD CONSTRAINT "lens_barcodes_variant_id_lens_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."lens_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lens_variants" ADD CONSTRAINT "lens_variants_lens_id_lenses_id_fk" FOREIGN KEY ("lens_id") REFERENCES "public"."lenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variant_id_lens_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."lens_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_variant_id_lens_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."lens_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_lens_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."lens_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_pickup_store_id_stores_id_fk" FOREIGN KEY ("pickup_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_collected_by_users_id_fk" FOREIGN KEY ("collected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_prescriptions_customer_idx" ON "customer_prescriptions" USING btree ("customer_id","eye_side");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_user_id_unique" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_referrer_code_idx" ON "customers" USING btree ("referrer_code") WHERE referrer_code IS NOT NULL;--> statement-breakpoint
CREATE INDEX "customers_referred_by_id_idx" ON "customers" USING btree ("referred_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_idx" ON "users" USING btree ("phone") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email") WHERE email IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_code_unique" ON "stores" USING btree ("code");--> statement-breakpoint
CREATE INDEX "stores_name_idx" ON "stores" USING btree ("name");--> statement-breakpoint
CREATE INDEX "stores_active_idx" ON "stores" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "lens_barcodes_barcode_unique" ON "lens_barcodes" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "lens_barcodes_variant_idx" ON "lens_barcodes" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lens_variants_sku_unique" ON "lens_variants" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "lens_variants_lens_idx" ON "lens_variants" USING btree ("lens_id");--> statement-breakpoint
CREATE INDEX "lens_variants_sphere_idx" ON "lens_variants" USING btree ("lens_id","sphere","cylinder","axis");--> statement-breakpoint
CREATE UNIQUE INDEX "lenses_product_code_unique" ON "lenses" USING btree ("product_code");--> statement-breakpoint
CREATE INDEX "lenses_brand_idx" ON "lenses" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "lenses_active_idx" ON "lenses" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_variant_unique" ON "inventory" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "inventory_on_hand_idx" ON "inventory" USING btree ("quantity_on_hand");--> statement-breakpoint
CREATE INDEX "inventory_movements_variant_idx" ON "inventory_movements" USING btree ("variant_id","performed_at");--> statement-breakpoint
CREATE INDEX "inventory_movements_reference_idx" ON "inventory_movements" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "inventory_movements_performed_at_idx" ON "inventory_movements" USING btree ("performed_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_idx" ON "order_status_history" USING btree ("order_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_unique" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_idx" ON "orders" USING btree ("pickup_store_id","status");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_paid_at_idx" ON "payments" USING btree ("paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_pg_txn_unique" ON "payments" USING btree ("pg_transaction_id") WHERE pg_transaction_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notifications_reference_idx" ON "notifications" USING btree ("reference_type","reference_id");