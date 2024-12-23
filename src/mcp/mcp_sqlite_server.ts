/**
 * src/mcp/mcp_sqlite_server.ts
 *
 * MCP server for your actual database schema.
 * Exposes multiple "tools" (SQL queries) to read meeting data from SQLite.
 */

import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types';
import { Database } from 'bun:sqlite';

/** Path to your SQLite file; override with env DB_PATH if desired. */
const DB_PATH = process.env.DB_PATH || './data/meeting.sqlite';

/** Singleton for our DB connection. */
let db: Database | null = null;
function openDb(): Database {
  if (!db) {
    db = new Database(DB_PATH);
  }
  return db;
}

/** Create the MCP server instance. */
const server = new Server(
  { name: 'granola-db', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

/**
 * Tools list: we define a set of named tools, each with a JSON Schema for input.
 * The client will show these in a UI (like Claude Desktop's MCP Tools).
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Basic "historical_documents" queries
      {
        name: 'fetch_recent_docs',
        description:
          'Retrieve recently updated rows from historical_documents, ordered by rowid desc',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max rows to fetch' },
          },
          required: ['limit'],
        },
      },
      {
        name: 'get_doc_by_id',
        description: 'Retrieve a single historical_documents row by ID',
        inputSchema: {
          type: 'object',
          properties: {
            docId: { type: 'string', description: 'UUID of the historical doc (id field)' },
          },
          required: ['docId'],
        },
      },

      // Tools referencing "documents" / "calendar_events" / "transcript_entries" / "people"
      {
        name: 'export_latest_meeting_md',
        description:
          'Export the newest valid (documents.valid_meeting=1) meeting to a Markdown string, including participants + transcripts',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'aggregate_meetings_md',
        description:
          'Combine multiple valid meetings from the last X days into one large Markdown summary',
        inputSchema: {
          type: 'object',
          properties: {
            days: { type: 'number', description: 'Number of days to look back' },
          },
          required: ['days'],
        },
      },
      {
        name: 'transcript_snippets',
        description:
          'Fetch transcript_entries for a specific doc (documents.id), optionally limited in number',
        inputSchema: {
          type: 'object',
          properties: {
            docId: { type: 'string', description: 'UUID from documents.id' },
            limit: { type: 'number', description: 'Max transcript entries to return' },
          },
          required: ['docId'],
        },
      },
      {
        name: 'top_participants',
        description:
          'Show which participants joined the most valid documents in last X days (based on people, documents tables)',
        inputSchema: {
          type: 'object',
          properties: {
            days: { type: 'number', description: 'Look back how many days' },
            limit: { type: 'number', description: 'Max participants to return' },
          },
          required: ['days', 'limit'],
        },
      },
      {
        name: 'recent_meeting_context_windows',
        description:
          'Create chunked transcript windows for the last X days of valid documents, helping with large LLM context usage',
        inputSchema: {
          type: 'object',
          properties: {
            days: { type: 'number', description: 'Number of days to look back' },
            chunkSize: { type: 'number', description: 'Transcript entries per chunk' },
          },
          required: ['days', 'chunkSize'],
        },
      },
    ],
  };
});

/**
 * Each tool's logic is implemented here.
 * We'll reference your actual columns (valid_meeting, deleted_at, etc.).
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const conn = openDb();

  try {
    switch (name) {
      //----------------------------------------------------------------------
      // 1) Basic examples referencing "historical_documents"
      //----------------------------------------------------------------------
      case 'fetch_recent_docs': {
        const limit = (args?.limit as number) || 5;
        const rows = conn
          .query(
            `
          SELECT *
          FROM historical_documents
          ORDER BY rowid DESC
          LIMIT ?;
        `
          )
          .all(limit);

        return { content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }] };
      }

      case 'get_doc_by_id': {
        const docId = args?.docId as string;
        const row = conn
          .query(
            `
          SELECT *
          FROM historical_documents
          WHERE id = ?;
        `
          )
          .get(docId);

        if (!row) {
          return {
            content: [
              { type: 'text', text: `No historical_documents record found with id=${docId}` },
            ],
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(row, null, 2) }],
        };
      }

      //----------------------------------------------------------------------
      // 2) "export_latest_meeting_md"
      //    (documents + calendar_events + people + transcript_entries)
      //----------------------------------------------------------------------
      case 'export_latest_meeting_md': {
        /**
         *  1) We find the newest doc from documents where valid_meeting=1 AND deleted_at IS NULL
         *  2) Join with calendar_events for location/time
         *  3) Then gather participants from people
         *  4) Then gather transcripts from transcript_entries
         *  5) Produce a combined Markdown
         */

        // Step 1: documents + calendar_events
        interface DocRow {
          docId: string;
          docTitle: string;
          created_at: string;
          updated_at: string;
          notes_markdown: string;
          start_time: string;
          end_time: string;
          location: string;
          html_link: string;
        }

        const docRow = conn
          .query<DocRow, [void]>(
            `
          WITH latest_meeting AS (
            SELECT id
            FROM documents
            WHERE valid_meeting = 1
              AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
          )
          SELECT
            d.id AS docId,
            d.title AS docTitle,
            d.created_at,
            d.updated_at,
            d.notes_markdown,
            ce.start_time,
            ce.end_time,
            ce.location,
            ce.html_link
          FROM latest_meeting lm
          JOIN documents d ON d.id = lm.id
          LEFT JOIN calendar_events ce ON ce.document_id = d.id
          LIMIT 1;
        `
          )
          .get();

        if (!docRow) {
          return { content: [{ type: 'text', text: 'No latest valid meeting found.' }] };
        }

        // Step 2: participants from "people"
        const participants = conn
          .query(
            `
          SELECT email, name, role, response_status
          FROM people
          WHERE document_id = ?;
        `
          )
          .all(docRow.docId);

        // Step 3: transcripts from "transcript_entries"
        const transcripts = conn
          .query(
            `
          SELECT 
            start_timestamp, end_timestamp, speaker, text, sequence_number
          FROM transcript_entries
          WHERE document_id = ?
          ORDER BY start_timestamp, sequence_number;
        `
          )
          .all(docRow.docId);

        // Step 4: Build the Markdown
        let mdOutput = `# ${docRow.docTitle || 'Untitled Meeting'}\n\n`;
        mdOutput += `**Created**: ${docRow.created_at}\n\n`;
        mdOutput += docRow.updated_at ? `**Last Update**: ${docRow.updated_at}\n\n` : '';

        if (docRow.start_time) {
          mdOutput += `**Meeting Time**: ${docRow.start_time} — ${docRow.end_time}\n\n`;
        }
        if (docRow.location) {
          mdOutput += `**Location**: ${docRow.location}\n\n`;
        }
        if (docRow.html_link) {
          mdOutput += `**Calendar Link**: ${docRow.html_link}\n\n`;
        }

        // participants
        if (participants.length) {
          mdOutput += '## Participants\n\n';
          for (const p of participants) {
            const display = p.name || p.email || '???';
            const rolePart = p.role ? ` (${p.role})` : '';
            const resp = p.response_status ? ` - ${p.response_status}` : '';
            mdOutput += `- **${display}**${rolePart}${resp}\n`;
          }
          mdOutput += '\n';
        }

        // notes_markdown from doc
        mdOutput += '## Notes\n\n';
        mdOutput += docRow.notes_markdown || '*(No notes)*';
        mdOutput += '\n\n';

        // transcripts
        if (transcripts.length) {
          mdOutput += '## Transcript\n\n';
          for (const t of transcripts) {
            // Add a bracketed start time or sequence?
            mdOutput += `[${t.start_timestamp}] ${t.speaker}: ${t.text}\n\n`;
          }
        } else {
          mdOutput += '*(No transcripts)*\n\n';
        }

        mdOutput = mdOutput.trim();

        return { content: [{ type: 'text', text: mdOutput }] };
      }

      //----------------------------------------------------------------------
      // 3) "aggregate_meetings_md"
      //    (multiple documents from last X days)
      //----------------------------------------------------------------------
      case 'aggregate_meetings_md': {
        const days = (args?.days as number) || 7;

        // documents table has created_at column
        interface DocumentRow {
          id: string;
          title: string;
          created_at: string;
          notes_markdown: string | null;
        }

        const rows = conn
          .query<DocumentRow, [number]>(
            `
          SELECT 
            d.id, d.title, d.created_at, d.notes_markdown
          FROM documents d
          WHERE d.valid_meeting = 1
            AND d.deleted_at IS NULL
            AND datetime(d.created_at) >= datetime('now', ? || ' days')
          ORDER BY d.created_at DESC;
        `
          )
          .all(-days);

        if (!rows.length) {
          return {
            content: [{ type: 'text', text: `No valid meetings found in last ${days} days.` }],
          };
        }

        let output = `# Valid Meetings in Last ${days} Days\n\n`;
        for (const r of rows) {
          output += `## ${r.title}\n`;
          output += `- **Doc ID**: ${r.id}\n`;
          output += `- **Created**: ${r.created_at}\n\n`;
          output += `**Notes**:\n${r.notes_markdown || '*(No notes)*'}\n\n---\n\n`;
        }
        output = output.trim();

        return { content: [{ type: 'text', text: output }] };
      }

      //----------------------------------------------------------------------
      // 4) "transcript_snippets"
      //    (for a single doc from "transcript_entries")
      //----------------------------------------------------------------------
      case 'transcript_snippets': {
        const docId = args?.docId as string;
        const limit = (args?.limit as number) || 50;

        // We'll fetch transcript_entries for doc
        const entries = conn
          .query(
            `
          SELECT id, text, speaker, start_timestamp
          FROM transcript_entries
          WHERE document_id = ?
          ORDER BY start_timestamp
          LIMIT ?;
        `
          )
          .all(docId, limit);

        if (!entries.length) {
          return {
            content: [{ type: 'text', text: `No transcript entries found for doc ID: ${docId}` }],
          };
        }

        let snippet = `**Transcript Snippets (docId=${docId}, up to ${limit}):**\n`;
        for (const e of entries) {
          snippet += `[${e.start_timestamp}] ${e.speaker}: ${e.text}\n`;
        }
        snippet = snippet.trim();

        return { content: [{ type: 'text', text: snippet }] };
      }

      //----------------------------------------------------------------------
      // 5) "top_participants"
      //    (count distinct documents from people + documents in last X days)
      //----------------------------------------------------------------------
      case 'top_participants': {
        const days = (args?.days as number) || 30;
        const limit = (args?.limit as number) || 10;

        // People => references documents(id).
        // We'll only count docs that are valid_meeting=1 + deleted_at IS NULL,
        // and created in last X days.
        const result = conn
          .query(
            `
          SELECT p.email AS participant_email,
                 COUNT(DISTINCT p.document_id) AS meeting_count
          FROM people p
          JOIN documents d ON d.id = p.document_id
          WHERE d.deleted_at IS NULL
            AND d.valid_meeting = 1
            AND datetime(d.created_at) >= datetime('now', ? || ' days')
          GROUP BY p.email
          ORDER BY meeting_count DESC
          LIMIT ?;
        `
          )
          .all(-days, limit);

        if (!result.length) {
          return {
            content: [{ type: 'text', text: `No participants found in last ${days} days.` }],
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      //----------------------------------------------------------------------
      // 6) "recent_meeting_context_windows"
      //    (docs from last X days, chunk transcripts, to feed LLM in windows)
      //----------------------------------------------------------------------
      case 'recent_meeting_context_windows': {
        const days = (args?.days as number) || 7;
        const chunkSize = (args?.chunkSize as number) || 50;

        // We gather transcripts from "documents" joined to "transcript_entries"
        // for all docs in last X days.
        interface TranscriptRow {
          docId: string;
          docTitle: string;
          tId: string;
          tText: string;
          tSpeaker: string;
          tStart: string;
        }

        const transcripts = conn
          .query<TranscriptRow, [number]>(
            `
          SELECT
            d.id AS docId,
            d.title AS docTitle,
            t.id AS tId,
            t.text AS tText,
            t.speaker AS tSpeaker,
            t.start_timestamp AS tStart
          FROM documents d
          JOIN transcript_entries t ON t.document_id = d.id
          WHERE d.deleted_at IS NULL
            AND d.valid_meeting = 1
            AND datetime(d.created_at) >= datetime('now', ? || ' days')
          ORDER BY d.created_at DESC, t.start_timestamp ASC;
        `
          )
          .all(-days);

        if (!transcripts.length) {
          return {
            content: [{ type: 'text', text: `No transcripts found in the last ${days} days.` }],
          };
        }

        const windows: string[] = [];
        let currentChunk: string[] = [];
        let currentDocId = '';
        for (const row of transcripts) {
          // If doc changes, add a doc header line:
          if (row.docId !== currentDocId) {
            currentDocId = row.docId;
            currentChunk.push(`\n---\n**Doc**: ${row.docTitle} (ID: ${row.docId})\n`);
          }

          const line = `[${row.tStart}] ${row.tSpeaker}: ${row.tText}`;
          currentChunk.push(line);

          if (currentChunk.length >= chunkSize) {
            windows.push(currentChunk.join('\n'));
            currentChunk = [];
          }
        }

        // final partial chunk
        if (currentChunk.length) {
          windows.push(currentChunk.join('\n'));
        }

        if (!windows.length) {
          return { content: [{ type: 'text', text: 'No transcript data after chunking.' }] };
        }

        // Combine them
        let finalOutput = windows
          .map((chunk, idx) => `\n--- [Context Window #${idx + 1}] ---\n${chunk}`)
          .join('\n\n');
        finalOutput = finalOutput.trim();

        return { content: [{ type: 'text', text: finalOutput }] };
      }

      //----------------------------------------------------------------------
      // Fallback if no tool name matches
      //----------------------------------------------------------------------
      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool name: ${name}` }],
        };
    }
  } catch (err: any) {
    // Catch any DB or logic errors
    return {
      isError: true,
      content: [{ type: 'text', text: `SQL Error: ${err.message}` }],
    };
  }
});

/**
 * Boot the server over stdio so Claude (or other clients) can connect.
 * Make sure you have "bun run src/mcp/mcp_sqlite_server.ts" or similar
 * in your config for claude_desktop_config.json
 */
async function main() {
  console.error(`Starting MCP server with DB_PATH=${DB_PATH}`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP server is running, tools are now available via MCP.');
}

main().catch((err) => {
  console.error('Fatal error in MCP server:', err);
  process.exit(1);
});
