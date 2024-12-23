export const peopleSchema = `
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  email TEXT,
  name TEXT,
  role TEXT,
  response_status TEXT,
  avatar_url TEXT,
  company_name TEXT,
  job_title TEXT
);
`;