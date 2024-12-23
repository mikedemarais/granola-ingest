import {
  CallToolRequest,
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Server,
  StdioServerTransport,
} from '@modelcontextprotocol/sdk/dist/server/index.js';
import { Database } from 'bun:sqlite';

// Initialize database connection
const db = new Database(process.env.DB_PATH || './database.sqlite');

// Create server instance
const server = new Server(
  {
    name: 'granola-sqlite',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {}, // Enable tools capability
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'query_meetings',
        description: 'Query the meetings database by date range',
        inputSchema: {
          type: 'object',
          properties: {
            startDate: {
              type: 'string',
              description: 'Start date in YYYY-MM-DD format',
            },
            endDate: {
              type: 'string',
              description: 'End date in YYYY-MM-DD format',
            },
          },
          required: ['startDate', 'endDate'],
        },
      },
      {
        name: 'get_meeting_transcript',
        description: 'Get the transcript for a specific meeting',
        inputSchema: {
          type: 'object',
          properties: {
            meetingId: {
              type: 'string',
              description: 'ID of the meeting',
            },
          },
          required: ['meetingId'],
        },
      },
      {
        name: 'search_notes',
        description: 'Search meeting notes for keywords',
        inputSchema: {
          type: 'object',
          properties: {
            keywords: {
              type: 'string',
              description: 'Keywords to search for',
            },
          },
          required: ['keywords'],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'query_meetings': {
        const { startDate, endDate } = args;
        const meetings = db
          .prepare(
            `
            SELECT d.id, d.title, d.created_at, d.notes_markdown, 
                   GROUP_CONCAT(p.name) as participants
            FROM documents d
            LEFT JOIN people p ON d.id = p.document_id
            WHERE d.created_at BETWEEN ? AND ?
            GROUP BY d.id
            ORDER BY d.created_at DESC
          `
          )
          .all(startDate, endDate);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(meetings, null, 2),
            },
          ],
        };
      }

      case 'get_meeting_transcript': {
        const { meetingId } = args;
        const transcript = db
          .prepare(
            `
            SELECT te.speaker, te.text, te.start_timestamp
            FROM transcript_entries te
            WHERE te.document_id = ?
            ORDER BY te.start_timestamp
          `
          )
          .all(meetingId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(transcript, null, 2),
            },
          ],
        };
      }

      case 'search_notes': {
        const { keywords } = args;
        const results = db
          .prepare(
            `
            SELECT d.id, d.title, d.notes_markdown, d.created_at
            FROM documents d
            WHERE d.notes_markdown LIKE ?
            ORDER BY d.created_at DESC
          `
          )
          .all(`%${keywords}%`);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    console.error(`Error executing tool ${name}:`, error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Granola SQLite MCP Server running');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
