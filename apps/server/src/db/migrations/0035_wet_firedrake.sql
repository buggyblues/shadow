DO $$ BEGIN
  CREATE TYPE "public"."iap_order_status" AS ENUM('pending', 'verified', 'succeeded', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."payment_order_status" AS ENUM('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'disputed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"event_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_daily_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"date" date NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"online_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_hourly_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"hour_of_day" integer NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"activity_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dm_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dm_message_id" uuid NOT NULL,
	"filename" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dm_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dm_message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_reactions_unique" UNIQUE("dm_message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "iap_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" varchar(255) NOT NULL,
	"original_transaction_id" varchar(255),
	"product_id" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"order_no" varchar(32) NOT NULL,
	"shrimp_coin_amount" integer NOT NULL,
	"status" "iap_order_status" DEFAULT 'pending' NOT NULL,
	"receipt_data" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "iap_orders_transaction_id_unique" UNIQUE("transaction_id"),
	CONSTRAINT "iap_orders_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_change_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"success" boolean DEFAULT true NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"stripe_customer_id" varchar(255),
	"user_id" uuid NOT NULL,
	"order_no" varchar(32) NOT NULL,
	"shrimp_coin_amount" integer NOT NULL,
	"usd_amount" integer NOT NULL,
	"local_currency_amount" integer,
	"local_currency" varchar(3),
	"status" "payment_order_status" DEFAULT 'pending' NOT NULL,
	"requires_action" boolean DEFAULT false,
	"action_type" varchar(50),
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id"),
	CONSTRAINT "payment_orders_order_no_unique" UNIQUE("order_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_comment_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_comment_reactions_unique" UNIQUE("comment_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profile_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_user_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "channels" ADD COLUMN "last_message_at" timestamp with time zone; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "claw_listings" ADD COLUMN "base_daily_rate" integer DEFAULT 0 NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "claw_listings" ADD COLUMN "message_fee" integer DEFAULT 0 NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "claw_listings" ADD COLUMN "pricing_version" integer DEFAULT 1 NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "dm_messages" ADD COLUMN "reply_to_id" uuid; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "dm_messages" ADD COLUMN "metadata" jsonb; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "messages" ADD COLUMN "metadata" jsonb; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notifications" ADD COLUMN "sender_id" uuid; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "rental_contracts" ADD COLUMN "base_daily_rate" integer DEFAULT 0 NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "rental_contracts" ADD COLUMN "message_fee" integer DEFAULT 0 NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "rental_contracts" ADD COLUMN "pricing_version" integer DEFAULT 1 NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "rental_contracts" ADD COLUMN "last_billed_daily_at" timestamp with time zone; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "rental_contracts" ADD COLUMN "message_count" integer DEFAULT 0 NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "rental_contracts" ADD COLUMN "last_billed_message_count" integer DEFAULT 0 NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "rental_usage_records" ADD COLUMN "message_count" integer DEFAULT 0 NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "rental_usage_records" ADD COLUMN "message_cost" integer DEFAULT 0 NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "rental_usage_records" ADD COLUMN "base_rental_cost" integer DEFAULT 0 NOT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "users" ADD COLUMN "oauth_app_id" uuid; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "users" ADD COLUMN "parent_user_id" uuid; EXCEPTION WHEN duplicate_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "agent_activity_events" ADD CONSTRAINT "agent_activity_events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "agent_daily_stats" ADD CONSTRAINT "agent_daily_stats_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "agent_hourly_stats" ADD CONSTRAINT "agent_hourly_stats_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "dm_attachments" ADD CONSTRAINT "dm_attachments_dm_message_id_dm_messages_id_fk" FOREIGN KEY ("dm_message_id") REFERENCES "public"."dm_messages"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "dm_reactions" ADD CONSTRAINT "dm_reactions_dm_message_id_dm_messages_id_fk" FOREIGN KEY ("dm_message_id") REFERENCES "public"."dm_messages"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "dm_reactions" ADD CONSTRAINT "dm_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "iap_orders" ADD CONSTRAINT "iap_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "password_change_logs" ADD CONSTRAINT "password_change_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "profile_comment_reactions" ADD CONSTRAINT "profile_comment_reactions_comment_id_profile_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."profile_comments"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "profile_comment_reactions" ADD CONSTRAINT "profile_comment_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "profile_comments" ADD CONSTRAINT "profile_comments_profile_user_id_users_id_fk" FOREIGN KEY ("profile_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "profile_comments" ADD CONSTRAINT "profile_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "profile_comments" ADD CONSTRAINT "profile_comments_parent_id_profile_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."profile_comments"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dm_attachments_dm_message_id_idx" ON "dm_attachments" USING btree ("dm_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dm_reactions_dm_message_id_idx" ON "dm_reactions" USING btree ("dm_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dm_reactions_user_id_idx" ON "dm_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_comment_reactions_comment_id" ON "profile_comment_reactions" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_comment_reactions_user_id" ON "profile_comment_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_comments_profile_user_id" ON "profile_comments" USING btree ("profile_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_comments_author_id" ON "profile_comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profile_comments_parent_id" ON "profile_comments" USING btree ("parent_id");--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_policies_agent_id_idx" ON "agent_policies" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_policies_server_id_idx" ON "agent_policies" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_policies_channel_id_idx" ON "agent_policies" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_owner_id_idx" ON "agents" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apps_server_id_idx" ON "apps" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apps_channel_id_idx" ON "apps" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attachments_message_id_idx" ON "attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cart_items_user_id_idx" ON "cart_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cart_items_shop_id_idx" ON "cart_items" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cart_items_product_id_idx" ON "cart_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channel_members_user_id_idx" ON "channel_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "channels_server_id_idx" ON "channels" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claw_listings_owner_id_idx" ON "claw_listings" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dm_channels_user_a_id_idx" ON "dm_channels" USING btree ("user_a_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dm_channels_user_b_id_idx" ON "dm_channels" USING btree ("user_b_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dm_messages_dm_channel_id_idx" ON "dm_messages" USING btree ("dm_channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dm_messages_created_at_idx" ON "dm_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entitlements_user_id_idx" ON "entitlements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entitlements_server_id_idx" ON "entitlements" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "entitlements_type_idx" ON "entitlements" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_requester_id_idx" ON "friendships" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_addressee_id_idx" ON "friendships" USING btree ("addressee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendships_status_idx" ON "friendships" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invite_codes_created_by_idx" ON "invite_codes" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_server_id_idx" ON "members" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "members_user_id_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_channel_id_idx" ON "messages" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_thread_id_idx" ON "messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_is_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_app_id_idx" ON "oauth_access_tokens" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_access_tokens_user_id_idx" ON "oauth_access_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_accounts_user_id_idx" ON "oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_accounts_provider_idx" ON "oauth_accounts" USING btree ("provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_accounts_provider_account_id_idx" ON "oauth_accounts" USING btree ("provider_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_apps_user_id_idx" ON "oauth_apps" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_app_id_idx" ON "oauth_authorization_codes" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_authorization_codes_user_id_idx" ON "oauth_authorization_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_consents_user_id_idx" ON "oauth_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_consents_app_id_idx" ON "oauth_consents" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_refresh_tokens_access_token_id_idx" ON "oauth_refresh_tokens" USING btree ("access_token_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_refresh_tokens_app_id_idx" ON "oauth_refresh_tokens" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "oauth_refresh_tokens_user_id_idx" ON "oauth_refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_product_id_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_shop_id_idx" ON "orders" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_buyer_id_idx" ON "orders" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_categories_shop_id_idx" ON "product_categories" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_media_product_id_idx" ON "product_media" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_shop_id_idx" ON "products" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactions_message_id_idx" ON "reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactions_user_id_idx" ON "reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_contracts_listing_id_idx" ON "rental_contracts" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_contracts_tenant_id_idx" ON "rental_contracts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_contracts_owner_id_idx" ON "rental_contracts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_contracts_status_idx" ON "rental_contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_usage_records_contract_id_idx" ON "rental_usage_records" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_violations_contract_id_idx" ON "rental_violations" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_violations_violator_id_idx" ON "rental_violations" USING btree ("violator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_product_id_idx" ON "reviews" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_order_id_idx" ON "reviews" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_user_id_idx" ON "reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "servers_owner_id_idx" ON "servers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skus_product_id_idx" ON "skus" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "threads_channel_id_idx" ON "threads" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "threads_parent_message_id_idx" ON "threads" USING btree ("parent_message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_transactions_wallet_id_idx" ON "wallet_transactions" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_transactions_created_at_idx" ON "wallet_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_nodes_workspace_id_idx" ON "workspace_nodes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_nodes_parent_id_idx" ON "workspace_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspaces_server_id_idx" ON "workspaces" USING btree ("server_id");