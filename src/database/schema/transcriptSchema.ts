export const transcriptSchema = `
CREATE TABLE IF NOT EXISTS transcript_entries (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  text TEXT,
  source TEXT,
  speaker TEXT,
  start_timestamp TIMESTAMP WITH TIME ZONE,
  end_timestamp TIMESTAMP WITH TIME ZONE,
  is_final BOOLEAN,
  sequence_number INTEGER
);

CREATE INDEX IF NOT EXISTS idx_transcript_entries_document_id ON transcript_entries(document_id);
`;