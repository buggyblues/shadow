-- Add metadata column to messages table for agent chain tracking
ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add metadata column to dm_messages table for agent chain tracking
ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add comment to document the metadata structure
COMMENT ON COLUMN messages.metadata IS 'Metadata for agent chains, custom data, etc. Structure: { agentChain: { agentId, depth, participants[], startedAt?, rootMessageId? } }';
COMMENT ON COLUMN dm_messages.metadata IS 'Metadata for agent chains, custom data, etc. Structure: { agentChain: { agentId, depth, participants[], startedAt?, rootMessageId? } }';