-- Community economy phase 2: assets, tips, gifts, settlement, and destination-less fulfillment.

ALTER TABLE "commerce_fulfillment_jobs"
  ALTER COLUMN "destination_kind" DROP NOT NULL,
  ALTER COLUMN "destination_id" DROP NOT NULL;

DO $$ BEGIN
  CREATE TYPE "community_asset_issuer_kind" AS ENUM ('platform', 'server', 'user', 'shop');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "community_asset_type" AS ENUM (
    'badge',
    'gift',
    'coupon',
    'service_ticket',
    'collectible',
    'content_pass',
    'reward'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "community_asset_definition_status" AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "community_asset_grant_status" AS ENUM ('active', 'locked', 'consumed', 'revoked', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "community_asset_transfer_action" AS ENUM ('grant', 'lock', 'gift', 'consume', 'revoke', 'expire', 'unlock');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "economy_tip_status" AS ENUM ('succeeded', 'failed', 'reversed', 'held');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "economy_gift_status" AS ENUM ('succeeded', 'failed', 'reversed', 'held');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "economy_gift_item_kind" AS ENUM ('currency', 'asset');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "settlement_owner_kind" AS ENUM ('user', 'shop', 'platform');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "settlement_line_status" AS ENUM (
    'pending',
    'available',
    'settled',
    'failed',
    'held',
    'reversed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "community_asset_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "issuer_kind" "community_asset_issuer_kind" NOT NULL,
  "issuer_id" text,
  "shop_id" uuid REFERENCES "shops"("id") ON DELETE set null,
  "asset_type" "community_asset_type" NOT NULL,
  "name" varchar(160) NOT NULL,
  "description" text,
  "image_url" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "giftable" boolean DEFAULT false NOT NULL,
  "transferable" boolean DEFAULT false NOT NULL,
  "consumable" boolean DEFAULT false NOT NULL,
  "revocable" boolean DEFAULT true NOT NULL,
  "expires_after_days" integer,
  "status" "community_asset_definition_status" DEFAULT 'draft' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "community_asset_definitions_shop_idx"
  ON "community_asset_definitions" ("shop_id");
CREATE INDEX IF NOT EXISTS "community_asset_definitions_issuer_idx"
  ON "community_asset_definitions" ("issuer_kind", "issuer_id");
CREATE INDEX IF NOT EXISTS "community_asset_definitions_status_idx"
  ON "community_asset_definitions" ("status");

CREATE TABLE IF NOT EXISTS "community_asset_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "definition_id" uuid NOT NULL REFERENCES "community_asset_definitions"("id") ON DELETE cascade,
  "owner_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "source_kind" varchar(80) NOT NULL,
  "source_id" text,
  "quantity" integer DEFAULT 1 NOT NULL,
  "remaining_quantity" integer DEFAULT 1 NOT NULL,
  "status" "community_asset_grant_status" DEFAULT 'active' NOT NULL,
  "expires_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "community_asset_grants_remaining_nonnegative" CHECK ("remaining_quantity" >= 0)
);
CREATE INDEX IF NOT EXISTS "community_asset_grants_definition_idx"
  ON "community_asset_grants" ("definition_id");
CREATE INDEX IF NOT EXISTS "community_asset_grants_owner_status_idx"
  ON "community_asset_grants" ("owner_user_id", "status");

CREATE TABLE IF NOT EXISTS "community_asset_transfer_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "definition_id" uuid REFERENCES "community_asset_definitions"("id") ON DELETE set null,
  "grant_id" uuid REFERENCES "community_asset_grants"("id") ON DELETE set null,
  "from_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "to_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "quantity" integer DEFAULT 1 NOT NULL,
  "action" "community_asset_transfer_action" NOT NULL,
  "reference_type" varchar(80),
  "reference_id" text,
  "idempotency_key" varchar(240) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "community_asset_transfer_logs_idempotency_unique" UNIQUE ("idempotency_key")
);
CREATE INDEX IF NOT EXISTS "community_asset_transfer_logs_grant_idx"
  ON "community_asset_transfer_logs" ("grant_id");
CREATE INDEX IF NOT EXISTS "community_asset_transfer_logs_definition_idx"
  ON "community_asset_transfer_logs" ("definition_id");

CREATE TABLE IF NOT EXISTS "economy_tips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sender_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "recipient_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "amount" integer NOT NULL,
  "currency_code" varchar(40) DEFAULT 'shrimp_coin' NOT NULL,
  "context_kind" varchar(80),
  "context_id" text,
  "message" text,
  "platform_fee" integer DEFAULT 0 NOT NULL,
  "seller_net" integer DEFAULT 0 NOT NULL,
  "status" "economy_tip_status" DEFAULT 'succeeded' NOT NULL,
  "idempotency_key" varchar(200) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "economy_tips_sender_idempotency_unique" UNIQUE ("sender_user_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "economy_tips_recipient_idx"
  ON "economy_tips" ("recipient_user_id");
CREATE INDEX IF NOT EXISTS "economy_tips_context_idx"
  ON "economy_tips" ("context_kind", "context_id");

CREATE TABLE IF NOT EXISTS "economy_gifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sender_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "recipient_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "message" text,
  "status" "economy_gift_status" DEFAULT 'succeeded' NOT NULL,
  "idempotency_key" varchar(200) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "economy_gifts_sender_idempotency_unique" UNIQUE ("sender_user_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "economy_gifts_recipient_idx"
  ON "economy_gifts" ("recipient_user_id");

CREATE TABLE IF NOT EXISTS "economy_gift_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gift_id" uuid NOT NULL REFERENCES "economy_gifts"("id") ON DELETE cascade,
  "item_kind" "economy_gift_item_kind" NOT NULL,
  "asset_grant_id" uuid REFERENCES "community_asset_grants"("id") ON DELETE set null,
  "asset_definition_id" uuid REFERENCES "community_asset_definitions"("id") ON DELETE set null,
  "quantity" integer DEFAULT 1 NOT NULL,
  "currency_code" varchar(40),
  "amount" integer,
  "status" "economy_gift_status" DEFAULT 'succeeded' NOT NULL
);
CREATE INDEX IF NOT EXISTS "economy_gift_items_gift_idx"
  ON "economy_gift_items" ("gift_id");

CREATE TABLE IF NOT EXISTS "settlement_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_kind" "settlement_owner_kind" NOT NULL,
  "owner_id" text NOT NULL,
  "currency_code" varchar(40) DEFAULT 'shrimp_coin' NOT NULL,
  "available_balance" integer DEFAULT 0 NOT NULL,
  "pending_balance" integer DEFAULT 0 NOT NULL,
  "held_balance" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "settlement_accounts_owner_unique" UNIQUE ("owner_kind", "owner_id", "currency_code")
);

CREATE TABLE IF NOT EXISTS "settlement_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "seller_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "shop_id" uuid REFERENCES "shops"("id") ON DELETE set null,
  "source_type" varchar(80) NOT NULL,
  "source_id" text NOT NULL,
  "gross_amount" integer NOT NULL,
  "platform_fee" integer DEFAULT 0 NOT NULL,
  "refund_amount" integer DEFAULT 0 NOT NULL,
  "held_amount" integer DEFAULT 0 NOT NULL,
  "net_amount" integer NOT NULL,
  "status" "settlement_line_status" DEFAULT 'pending' NOT NULL,
  "available_at" timestamp with time zone,
  "settled_at" timestamp with time zone,
  "error_code" varchar(120),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "settlement_lines_seller_status_idx"
  ON "settlement_lines" ("seller_user_id", "status");
CREATE INDEX IF NOT EXISTS "settlement_lines_source_idx"
  ON "settlement_lines" ("source_type", "source_id");
