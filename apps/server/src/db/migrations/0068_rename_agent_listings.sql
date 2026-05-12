ALTER TABLE IF EXISTS "claw_listings" RENAME TO "agent_listings";--> statement-breakpoint
ALTER INDEX IF EXISTS "claw_listings_owner_id_idx" RENAME TO "agent_listings_owner_id_idx";--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "agent_listings"
    RENAME CONSTRAINT "claw_listings_owner_id_users_id_fk" TO "agent_listings_owner_id_users_id_fk";
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "agent_listings"
    RENAME CONSTRAINT "claw_listings_agent_id_agents_id_fk" TO "agent_listings_agent_id_agents_id_fk";
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "rental_contracts"
    RENAME CONSTRAINT "rental_contracts_listing_id_claw_listings_id_fk" TO "rental_contracts_listing_id_agent_listings_id_fk";
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;
