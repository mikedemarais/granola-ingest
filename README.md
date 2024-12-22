# Granola Meeting Data Ingestor

A TypeScript application using Bun to monitor and ingest Granola meeting data into SQLite.

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
```