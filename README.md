# Granola Meeting Data Ingestor

A TypeScript + Bun application that monitors the Granola cache file and ingests meeting data into a SQLite database, retaining historical changes and providing utilities for debugging.

## Directory Structure

```text
src/
├── database
│   ├── schema
│   │   ├── documentSchema.ts
│   │   ├── calendarSchema.ts
│   │   ├── peopleSchema.ts
│   │   ├── transcriptSchema.ts
│   │   ├── templateSchema.ts
│   │   └── index.ts
│   ├── migrations/
│   └── connection.ts
├── services
│   ├── HistoryService.ts
│   ├── DocumentService.ts
│   ├── CalendarService.ts
│   ├── TranscriptService.ts
│   ├── PersonService.ts
│   ├── TemplateService.ts
│   └── StateTrackingService.ts
├── models
│   └── types.ts
├── utils
│   ├── hashing.ts
│   └── logger.ts
└── index.ts

Getting Started
	1.	Install Bun (if not already):

curl -fsSL https://bun.sh/install | bash


	2.	Install Dependencies:

bun install


	3.	Configure Environment:
Copy .env.example to .env, or manually set DB_PATH and DEBUG in your environment.

export DB_PATH=./data/database.sqlite
export DEBUG=true


	4.	Create Necessary Directories:

mkdir -p data logs


	5.	Start the Application:

bun run start

This monitors the specified cache file and ingests data into DB_PATH.

	6.	Development Mode (file watch):

bun run dev


	7.	Debug Mode (verbose logging):

bun run debug



How It Works
	1.	Monitoring: Watches the cache file (e.g., ~/Library/Application Support/Granola/cache-v3.json) for changes.
	2.	Parsing: When a change is detected, it parses the JSON payload, extracting documents, transcripts, calendar events, etc.
	3.	Hash-Based Checks: The StateTrackingService identifies which records have changed.
	4.	Historical Tracking: The HistoryService preserves older versions of documents in historical_documents.
	5.	Services:
	•	DocumentService handles documents.
	•	CalendarService handles calendar_events.
	•	TranscriptService handles transcript_entries.
	•	PersonService handles people.
	•	TemplateService handles panel_templates, template_sections, document_panels.

Logging
	•	All logs: logs/combined.log
	•	Error logs: logs/error.log
	•	Console output: Colored if DEBUG=true.

Tail logs in real-time:

tail -f logs/combined.log

SQL Queries

Below are a few useful SQL snippets you can run on the SQLite database (accessible via DB_PATH).

1. Export the Latest Meeting to Markdown

This query captures the latest meeting’s details and formats them in Markdown. Use .output in the sqlite3 CLI to direct the output to a file.

-- Example: Export the latest meeting to a markdown file
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
  (
    SELECT GROUP_CONCAT(
      '- **' || COALESCE(p2.name, p2.email) || '**' ||
      CASE WHEN p2.role IS NOT NULL THEN ' (' || p2.role || ')' ELSE '' END ||
      CASE WHEN p2.response_status IS NOT NULL
        THEN ' - ' || p2.response_status
        ELSE ''
      END ||
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
    (
      SELECT GROUP_CONCAT(
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
    ),
    '*No transcript available*'
  ) AS markdown_output
FROM latest_meeting lm
JOIN documents d ON d.id = lm.id
LEFT JOIN calendar_events ce ON ce.document_id = d.id
GROUP BY d.id;

2. Aggregate Multiple Meetings for LLM Summaries

Generate a Markdown file containing all meeting details within a specific timeframe.

.output all_meetings_since_last_week.md

WITH recent_meetings AS (
  SELECT id, title, created_at
  FROM documents
  WHERE valid_meeting = TRUE
    AND deleted_at IS NULL
    AND created_at > datetime('now', '-7 days')
  ORDER BY created_at DESC
)
SELECT
  '# ' || d.title || ' (Document: ' || d.id || ')\n\n' ||
  '## Meeting Details\n' ||
  '- **Date**: ' || datetime(d.created_at) || '\n' ||
  '-- more fields or custom formatting --' ||
  '\n\n----\n'
FROM recent_meetings rm
JOIN documents d ON d.id = rm.id
ORDER BY d.created_at DESC;

3. Quick Transcript Snippets for a Specific Document

Extract only the transcript text for a document.

SELECT
  '[' || datetime(t.start_timestamp) || '] '
  || t.speaker || ': '
  || t.text
FROM transcript_entries t
WHERE t.document_id = 'your-document-id'
ORDER BY t.start_timestamp, t.sequence_number;

4. Top Participants by Frequency in the Past Month

Identify the most active participants.

SELECT p.email, COUNT(*) AS meeting_count
FROM people p
JOIN documents d ON d.id = p.document_id
WHERE d.deleted_at IS NULL
  AND d.created_at > datetime('now', '-30 days')
GROUP BY p.email
ORDER BY COUNT(*) DESC
LIMIT 10;

License

MIT

