-- Password change audit logs for admin and security tracking
CREATE TABLE IF NOT EXISTS password_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(45),
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Index for querying by user
CREATE INDEX idx_password_change_logs_user_id ON password_change_logs(user_id);
-- Index for querying by time
CREATE INDEX idx_password_change_logs_created_at ON password_change_logs(created_at DESC);