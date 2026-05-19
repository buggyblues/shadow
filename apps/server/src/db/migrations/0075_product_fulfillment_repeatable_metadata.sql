-- Product fulfillment metadata change only updates the JSONB TypeScript shape.
-- Existing rows already store arbitrary JSON, so no physical database migration is needed.
SELECT 1;
