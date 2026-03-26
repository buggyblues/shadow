-- Migration: 0029_add_buddy_permissions
-- Description: Add Buddy permissions system for controlling agent visibility and access

-- Create enum for visibility levels
CREATE TYPE buddy_visibility AS ENUM ('public', 'private', 'restricted');

-- Buddy server settings table - per-server visibility configuration
CREATE TABLE buddy_server_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buddy_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    visibility buddy_visibility NOT NULL DEFAULT 'public',
    is_private BOOLEAN NOT NULL DEFAULT false,
    default_can_view BOOLEAN NOT NULL DEFAULT true,
    default_can_interact BOOLEAN NOT NULL DEFAULT true,
    default_can_mention BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(buddy_id, server_id)
);

-- Buddy permissions table - user-level permission grants
CREATE TABLE buddy_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buddy_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL DEFAULT true,
    can_interact BOOLEAN NOT NULL DEFAULT true,
    can_mention BOOLEAN NOT NULL DEFAULT true,
    can_manage BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(buddy_id, server_id, channel_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_buddy_server_settings_buddy_id ON buddy_server_settings(buddy_id);
CREATE INDEX idx_buddy_server_settings_server_id ON buddy_server_settings(server_id);
CREATE INDEX idx_buddy_server_settings_lookup ON buddy_server_settings(buddy_id, server_id);

CREATE INDEX idx_buddy_permissions_buddy_id ON buddy_permissions(buddy_id);
CREATE INDEX idx_buddy_permissions_server_id ON buddy_permissions(server_id);
CREATE INDEX idx_buddy_permissions_user_id ON buddy_permissions(user_id);
CREATE INDEX idx_buddy_permissions_channel_id ON buddy_permissions(channel_id);
CREATE INDEX idx_buddy_permissions_lookup ON buddy_permissions(buddy_id, server_id, user_id);
CREATE INDEX idx_buddy_permissions_full_lookup ON buddy_permissions(buddy_id, server_id, channel_id, user_id);

-- Trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_buddy_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_buddy_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER trigger_buddy_server_settings_updated_at
    BEFORE UPDATE ON buddy_server_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_buddy_settings_updated_at();

CREATE TRIGGER trigger_buddy_permissions_updated_at
    BEFORE UPDATE ON buddy_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_buddy_permissions_updated_at();
