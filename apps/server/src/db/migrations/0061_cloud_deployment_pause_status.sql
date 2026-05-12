ALTER TYPE "cloud_deployment_status" ADD VALUE IF NOT EXISTS 'paused';
ALTER TYPE "cloud_deployment_status" ADD VALUE IF NOT EXISTS 'resuming';
