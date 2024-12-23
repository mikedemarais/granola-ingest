export const calendarSchema = `
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  summary TEXT,
  description TEXT,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  timezone TEXT,
  status TEXT,
  calendar_id TEXT,
  html_link TEXT,
  hangout_link TEXT,
  location TEXT,
  organizer_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);

CREATE TABLE IF NOT EXISTS calendars (
  id TEXT PRIMARY KEY,
  summary TEXT,
  time_zone TEXT,
  access_role TEXT,
  background_color TEXT,
  foreground_color TEXT,
  primary_calendar BOOLEAN,
  selected BOOLEAN,
  conference_properties JSONB
);
`;