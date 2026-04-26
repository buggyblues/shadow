-- Add 'template_delete' value to cloud_activity_type enum.
ALTER TYPE "cloud_activity_type" ADD VALUE IF NOT EXISTS 'template_delete';
