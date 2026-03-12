-- P2P Rental / Marketplace Schema
-- Tables: claw_listings, rental_contracts, rental_usage_records, rental_violations

-- Enums
DO $$ BEGIN
  CREATE TYPE "public"."listing_status" AS ENUM('draft', 'active', 'paused', 'expired', 'closed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."rental_contract_status" AS ENUM('pending', 'active', 'completed', 'cancelled', 'violated', 'disputed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."device_tier" AS ENUM('high_end', 'mid_range', 'low_end');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."os_type" AS ENUM('macos', 'windows', 'linux');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- claw_listings
CREATE TABLE IF NOT EXISTS "claw_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "agent_id" uuid,
  "title" varchar(200) NOT NULL,
  "description" text,
  "skills" jsonb DEFAULT '[]'::jsonb,
  "guidelines" text,
  "device_tier" "device_tier" DEFAULT 'mid_range' NOT NULL,
  "os_type" "os_type" DEFAULT 'macos' NOT NULL,
  "device_info" jsonb DEFAULT '{}'::jsonb,
  "software_tools" jsonb DEFAULT '[]'::jsonb,
  "hourly_rate" integer DEFAULT 0 NOT NULL,
  "daily_rate" integer DEFAULT 0 NOT NULL,
  "monthly_rate" integer DEFAULT 0 NOT NULL,
  "token_fee_passthrough" boolean DEFAULT true NOT NULL,
  "premium_markup" integer DEFAULT 0 NOT NULL,
  "deposit_amount" integer DEFAULT 0 NOT NULL,
  "listing_status" "listing_status" DEFAULT 'draft' NOT NULL,
  "is_listed" boolean DEFAULT true NOT NULL,
  "available_from" timestamp with time zone,
  "available_until" timestamp with time zone,
  "view_count" integer DEFAULT 0 NOT NULL,
  "rental_count" integer DEFAULT 0 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- rental_contracts
CREATE TABLE IF NOT EXISTS "rental_contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contract_no" varchar(32) NOT NULL,
  "listing_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_id" uuid NOT NULL,
  "status" "rental_contract_status" DEFAULT 'pending' NOT NULL,
  "listing_snapshot" jsonb DEFAULT '{}'::jsonb,
  "hourly_rate" integer NOT NULL,
  "daily_rate" integer DEFAULT 0 NOT NULL,
  "monthly_rate" integer DEFAULT 0 NOT NULL,
  "platform_fee_rate" integer DEFAULT 500 NOT NULL,
  "deposit_amount" integer DEFAULT 0 NOT NULL,
  "owner_terms" text,
  "platform_terms" text,
  "tenant_agreed_at" timestamp with time zone,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone,
  "terminated_at" timestamp with time zone,
  "termination_reason" text,
  "total_cost" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "rental_contracts_contract_no_unique" UNIQUE("contract_no")
);
--> statement-breakpoint

-- rental_usage_records
CREATE TABLE IF NOT EXISTS "rental_usage_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contract_id" uuid NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "duration_minutes" integer DEFAULT 0 NOT NULL,
  "tokens_consumed" integer DEFAULT 0 NOT NULL,
  "token_cost" integer DEFAULT 0 NOT NULL,
  "electricity_cost" integer DEFAULT 0 NOT NULL,
  "rental_cost" integer DEFAULT 0 NOT NULL,
  "platform_fee" integer DEFAULT 0 NOT NULL,
  "total_cost" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- rental_violations
CREATE TABLE IF NOT EXISTS "rental_violations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contract_id" uuid NOT NULL,
  "violator_id" uuid NOT NULL,
  "violation_type" varchar(50) NOT NULL,
  "description" text,
  "penalty_amount" integer DEFAULT 0 NOT NULL,
  "is_penalty_paid" boolean DEFAULT false NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "claw_listings" ADD CONSTRAINT "claw_listings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "claw_listings" ADD CONSTRAINT "claw_listings_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_listing_id_claw_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."claw_listings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_tenant_id_users_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rental_usage_records" ADD CONSTRAINT "rental_usage_records_contract_id_rental_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."rental_contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rental_violations" ADD CONSTRAINT "rental_violations_contract_id_rental_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."rental_contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "rental_violations" ADD CONSTRAINT "rental_violations_violator_id_users_id_fk" FOREIGN KEY ("violator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
