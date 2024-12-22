# Granola Meeting Data Ingestor

[WIP] A janky TypeScript application using Bun to monitor and ingest Granola meeting data into SQLite.

## TODO

- [ ] Prevent the database from ballooning in size
- [ ] Add functions to output markdown files from sql queries

## Features

- Monitors Granola cache file for changes
- Parses and ingests meeting notes, transcripts, and metadata
- Maintains historical data
- Comprehensive logging and debugging support

## Setup

1. Clone the repository
```bash
git clone [repository-url]
cd granola-ingest
```

2. Install dependencies
```bash
bun install
```

3. Create environment file
```bash
cp .env.example .env
```

4. Create necessary directories
```bash
mkdir -p data logs
```

## Running

1. Normal mode:
```bash
bun run start
```

2. Development mode (with file watching):
```bash
bun run dev
```

3. Debug mode (with extra logging):
```bash
bun run debug
```

## Monitoring

- Check logs in the `logs` directory:
  - `combined.log`: All logs
  - `error.log`: Error logs only

- Monitor logs in real-time:
```bash
tail -f logs/combined.log
```

## Debugging

1. Enable debug mode in `.env`:
```
DEBUG=true
```

2. Check debug logs for detailed information about:
- Cache file reading
- Data parsing
- Database operations
- File system events

## Database Queries

Common queries for checking data:

```sql
-- Check recent meetings
SELECT title, created_at 
FROM documents 
ORDER BY created_at DESC 
LIMIT 5;

-- Check historical data
SELECT * FROM historical_documents 
WHERE document_id = 'your-document-id' 
ORDER BY history_timestamp DESC;

-- Check meeting participants
SELECT d.title, p.name, p.email, p.role 
FROM documents d 
JOIN people p ON d.id = p.document_id 
WHERE d.created_at > datetime('now', '-7 days');

-- Output the latest meeting to a markdown file
.output latest_meeting.md
WITH latest_meeting AS (
  SELECT id, title, created_at 
  FROM documents 
  WHERE valid_meeting = TRUE 
    AND deleted_at IS NULL 
  ORDER BY created_at DESC 
  LIMIT 1
)
SELECT 
  '# ' || d.title || '\n\n' ||
  '## Meeting Details\n' ||
  '- **Date**: ' || datetime(d.created_at) || '\n' ||
  CASE WHEN ce.start_time IS NOT NULL 
    THEN '- **Duration**: ' || datetime(ce.start_time) || ' to ' || datetime(ce.end_time) || '\n' 
    ELSE '' 
  END ||
  CASE WHEN ce.location IS NOT NULL 
    THEN '- **Location**: ' || ce.location || '\n'
    ELSE ''
  END ||
  CASE WHEN ce.html_link IS NOT NULL 
    THEN '- **Calendar Link**: ' || ce.html_link || '\n'
    ELSE ''
  END ||
  '\n## Participants\n' ||
  (SELECT GROUP_CONCAT(
    '- **' || COALESCE(p2.name, p2.email) || '**' ||
    CASE WHEN p2.role IS NOT NULL THEN ' (' || p2.role || ')' ELSE '' END ||
    CASE WHEN p2.response_status IS NOT NULL THEN ' - ' || p2.response_status ELSE '' END ||
    '\n'
  )
  FROM (
    SELECT DISTINCT name, email, role, response_status 
    FROM people p2 
    WHERE p2.document_id = d.id
    ORDER BY 
      CASE WHEN role = 'organizer' THEN 1 ELSE 2 END,
      name
  ) p2
  ) ||
  '\n## Notes\n\n' ||
  COALESCE(d.notes_markdown, d.notes_plain) ||
  '\n\n## Transcript\n\n' ||
  COALESCE(
    (SELECT GROUP_CONCAT(
      '[' || datetime(t2.start_timestamp) || '] ' ||
      CASE 
        WHEN t2.source = 'microphone' THEN 'Me: '
        WHEN t2.source = 'system' THEN 'Them: '
        ELSE '??? '
      END ||
      t2.text || '\n'
    )
    FROM transcript_entries t2
    WHERE t2.document_id = d.id
    ORDER BY t2.start_timestamp, t2.sequence_number
    ), '*No transcript available*')
FROM latest_meeting lm
JOIN documents d ON d.id = lm.id
LEFT JOIN calendar_events ce ON ce.document_id = d.id
GROUP BY d.id;
```