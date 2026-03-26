-- Profile comments: messages left on user/buddy profiles
CREATE TABLE IF NOT EXISTS profile_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES profile_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_comments_profile_user_id ON profile_comments(profile_user_id);
CREATE INDEX IF NOT EXISTS idx_profile_comments_author_id ON profile_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_profile_comments_parent_id ON profile_comments(parent_id);

-- Reactions to profile comments (emoji + tags)
CREATE TABLE IF NOT EXISTS profile_comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES profile_comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT profile_comment_reactions_unique UNIQUE (comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_profile_comment_reactions_comment_id ON profile_comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_profile_comment_reactions_user_id ON profile_comment_reactions(user_id);

-- Comment on tables
COMMENT ON TABLE profile_comments IS 'Comments left on user/buddy profile pages';
COMMENT ON TABLE profile_comment_reactions IS 'Emoji reactions to profile comments';