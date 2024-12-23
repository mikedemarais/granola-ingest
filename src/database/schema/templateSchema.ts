export const templateSchema = `
CREATE TABLE IF NOT EXISTS panel_templates (
  id UUID PRIMARY KEY,
  category TEXT,
  title TEXT,
  description TEXT,
  color TEXT,
  symbol TEXT,
  is_granola BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  shared_with TEXT,
  user_types JSONB
);

CREATE TABLE IF NOT EXISTS template_sections (
  id UUID PRIMARY KEY,
  template_id UUID REFERENCES panel_templates(id),
  heading TEXT,
  section_description TEXT,
  sequence_number INTEGER
);

CREATE TABLE IF NOT EXISTS document_panels (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  template_id UUID REFERENCES panel_templates(id),
  content JSONB,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_document_panels_document_id ON document_panels(document_id);
`;