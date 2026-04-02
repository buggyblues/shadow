-- Stripe & IAP recharge tables

DO $$ BEGIN
  CREATE TYPE "payment_order_status" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'disputed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "iap_order_status" AS ENUM ('pending', 'verified', 'succeeded', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "payment_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stripe_payment_intent_id" varchar(255) UNIQUE,
  "stripe_customer_id" varchar(255),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "order_no" varchar(32) NOT NULL UNIQUE,
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
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "iap_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "transaction_id" varchar(255) NOT NULL UNIQUE,
  "original_transaction_id" varchar(255),
  "product_id" varchar(255) NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "order_no" varchar(32) NOT NULL UNIQUE,
  "shrimp_coin_amount" integer NOT NULL,
  "status" "iap_order_status" DEFAULT 'pending' NOT NULL,
  "receipt_data" text,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
