export const documentSchema = `
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY,
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  user_id UUID,
  notes_markdown TEXT,
  notes_plain TEXT,
  transcribe BOOLEAN DEFAULT FALSE,
  public BOOLEAN DEFAULT FALSE,
  type TEXT,
  valid_meeting BOOLEAN DEFAULT TRUE,
  has_shareable_link BOOLEAN DEFAULT FALSE,
  creation_source TEXT,
  subscription_plan_id TEXT,
  privacy_mode_enabled BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
`;