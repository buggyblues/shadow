-- Add 'cancelling' status to cloud_deployment_status enum.
-- Used by the SaaS API to signal the cloud worker to abort an in-progress deploy.
ALTER TYPE "cloud_deployment_status" ADD VALUE IF NOT EXISTS 'cancelling';
