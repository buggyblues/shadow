-- Community economy phase 1: audit, provider event idempotency, risk cases, and fulfillment records.

DO $$ BEGIN
  CREATE TYPE "user_economy_status" AS ENUM ('normal', 'economy_restricted', 'frozen', 'banned');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "economy_status" "user_economy_status" DEFAULT 'normal' NOT NULL;

ALTER TYPE "commerce_deliverable_kind" ADD VALUE IF NOT EXISTS 'entitlement';
ALTER TYPE "commerce_deliverable_kind" ADD VALUE IF NOT EXISTS 'community_asset';
ALTER TYPE "commerce_deliverable_kind" ADD VALUE IF NOT EXISTS 'currency';

DO $$ BEGIN
  CREATE TYPE "economy_audit_result" AS ENUM ('started', 'succeeded', 'failed', 'denied');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "payment_provider_event_status" AS ENUM (
    'received',
    'processing',
    'processed',
    'failed',
    'ignored'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "risk_case_kind" AS ENUM (
    'payment_dispute',
    'chargeback',
    'economy_restricted',
    'fraud_signal'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "risk_case_status" AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "commerce_fulfillment_record_status" AS ENUM ('succeeded', 'failed', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "economy_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_kind" varchar(40) NOT NULL,
  "actor_id" text,
  "actor_token_kind" varchar(40),
  "action" varchar(120) NOT NULL,
  "resource_kind" varchar(80) NOT NULL,
  "resource_id" text,
  "scope_kind" varchar(80),
  "scope_id" text,
  "idempotency_key" varchar(200),
  "request_hash" varchar(128),
  "result" "economy_audit_result" NOT NULL,
  "error_code" varchar(120),
  "ip_hash" varchar(128),
  "user_agent_hash" varchar(128),
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "economy_audit_events_actor_idx"
  ON "economy_audit_events" ("actor_kind", "actor_id");
CREATE INDEX IF NOT EXISTS "economy_audit_events_action_idx"
  ON "economy_audit_events" ("action");
CREATE INDEX IF NOT EXISTS "economy_audit_events_resource_idx"
  ON "economy_audit_events" ("resource_kind", "resource_id");
CREATE INDEX IF NOT EXISTS "economy_audit_events_created_at_idx"
  ON "economy_audit_events" ("created_at");

CREATE TABLE IF NOT EXISTS "payment_provider_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" varchar(40) NOT NULL,
  "provider_event_id" varchar(255) NOT NULL,
  "event_type" varchar(120) NOT NULL,
  "payload_hash" varchar(128) NOT NULL,
  "payment_order_id" uuid REFERENCES "payment_orders"("id") ON DELETE set null,
  "status" "payment_provider_event_status" DEFAULT 'received' NOT NULL,
  "processed_at" timestamp with time zone,
  "error_code" varchar(120),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_provider_events_unique" UNIQUE ("provider", "provider_event_id")
);
CREATE INDEX IF NOT EXISTS "payment_provider_events_order_idx"
  ON "payment_provider_events" ("payment_order_id");
CREATE INDEX IF NOT EXISTS "payment_provider_events_status_idx"
  ON "payment_provider_events" ("status");

CREATE TABLE IF NOT EXISTS "risk_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "resource_type" varchar(80) NOT NULL,
  "resource_id" text,
  "kind" "risk_case_kind" NOT NULL,
  "status" "risk_case_status" DEFAULT 'open' NOT NULL,
  "severity" varchar(40) DEFAULT 'medium' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "risk_cases_user_idx" ON "risk_cases" ("user_id");
CREATE INDEX IF NOT EXISTS "risk_cases_kind_status_idx" ON "risk_cases" ("kind", "status");
CREATE INDEX IF NOT EXISTS "risk_cases_resource_idx" ON "risk_cases" ("resource_type", "resource_id");

CREATE TABLE IF NOT EXISTS "commerce_fulfillment_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid REFERENCES "commerce_fulfillment_jobs"("id") ON DELETE set null,
  "order_id" uuid REFERENCES "orders"("id") ON DELETE set null,
  "order_item_id" uuid REFERENCES "order_items"("id") ON DELETE set null,
  "deliverable_id" uuid REFERENCES "commerce_deliverables"("id") ON DELETE set null,
  "recipient_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "idempotency_key" varchar(240) NOT NULL,
  "result_type" varchar(80) NOT NULL,
  "result_id" text,
  "status" "commerce_fulfillment_record_status" DEFAULT 'succeeded' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "commerce_fulfillment_records_unique_delivery"
    UNIQUE ("order_item_id", "deliverable_id", "recipient_user_id"),
  CONSTRAINT "commerce_fulfillment_records_idempotency_unique"
    UNIQUE ("idempotency_key")
);
CREATE INDEX IF NOT EXISTS "commerce_fulfillment_records_job_idx"
  ON "commerce_fulfillment_records" ("job_id");
CREATE INDEX IF NOT EXISTS "commerce_fulfillment_records_order_idx"
  ON "commerce_fulfillment_records" ("order_id");
