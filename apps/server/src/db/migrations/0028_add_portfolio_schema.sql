-- 0011_add_portfolio_schema.sql
-- Portfolio tables for Buddy Portfolio feature

-- Create enums
CREATE TYPE portfolio_visibility AS ENUM ('public', 'private', 'unlisted');
CREATE TYPE portfolio_status AS ENUM ('draft', 'published', 'archived');

-- Create portfolios table
CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  title VARCHAR(200),
  description TEXT,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  file_width INTEGER,
  file_height INTEGER,
  thumbnail_url TEXT,
  visibility portfolio_visibility NOT NULL DEFAULT 'public',
  status portfolio_status NOT NULL DEFAULT 'published',
  like_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create portfolio_likes table
CREATE TABLE portfolio_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portfolio_likes_unique UNIQUE (portfolio_id, user_id)
);

-- Create portfolio_favorites table
CREATE TABLE portfolio_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portfolio_favorites_unique UNIQUE (portfolio_id, user_id)
);

-- Create portfolio_comments table
CREATE TABLE portfolio_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES portfolio_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_edited BOOLEAN NOT NULL DEFAULT FALSE
);

-- Create indexes for performance
CREATE INDEX idx_portfolios_owner_visibility ON portfolios(owner_id, visibility) 
  WHERE visibility = 'public';
CREATE INDEX idx_portfolios_created_at ON portfolios(created_at DESC);
CREATE INDEX idx_portfolios_tags ON portfolios USING GIN(tags);
CREATE INDEX idx_portfolios_attachment ON portfolios(attachment_id);

CREATE INDEX idx_portfolio_likes_portfolio ON portfolio_likes(portfolio_id);
CREATE INDEX idx_portfolio_likes_user ON portfolio_likes(user_id);

CREATE INDEX idx_portfolio_favorites_user ON portfolio_favorites(user_id, created_at DESC);
CREATE INDEX idx_portfolio_favorites_portfolio ON portfolio_favorites(portfolio_id);

CREATE INDEX idx_portfolio_comments_portfolio ON portfolio_comments(portfolio_id, created_at DESC);
CREATE INDEX idx_portfolio_comments_user ON portfolio_comments(user_id);
CREATE INDEX idx_portfolio_comments_parent ON portfolio_comments(parent_id);

-- Add self-referencing foreign key for comments after table creation
ALTER TABLE portfolio_comments 
  ADD CONSTRAINT fk_portfolio_comments_parent 
  FOREIGN KEY (parent_id) REFERENCES portfolio_comments(id) ON DELETE CASCADE;

-- Create updated_at trigger for portfolios
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portfolio_comments_updated_at
  BEFORE UPDATE ON portfolio_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();