import { Database } from 'bun:sqlite';
import { debug, logger } from './utils/logger';

export class HistoryTracker {
  constructor(private db: Database) {
    this.initializeHistoryTables();
  }

  private initializeHistoryTables() {
    const schemas = [
      `CREATE TABLE IF NOT EXISTS historical_documents (
        id UUID,
        document_id UUID,
        title TEXT,
        created_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE,
        deleted_at TIMESTAMP WITH TIME ZONE,
        user_id UUID,
        notes_markdown TEXT,
        notes_plain TEXT,
        transcribe BOOLEAN,
        public BOOLEAN,
        type TEXT,
        valid_meeting BOOLEAN,
        has_shareable_link BOOLEAN,
        creation_source TEXT,
        subscription_plan_id TEXT,
        privacy_mode_enabled BOOLEAN,
        history_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id, history_timestamp)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_historical_documents_document_id 
       ON historical_documents(document_id)`,
    ];

    this.db.transaction(() => {
      for (const schema of schemas) {
        this.db.run(schema);
      }
    })();
  }

  async trackDocumentHistory(doc: any) {
    const stmt = this.db.prepare(`
      INSERT INTO historical_documents (
        id, document_id, title, created_at, updated_at, deleted_at,
        user_id, notes_markdown, notes_plain, transcribe, public,
        type, valid_meeting, has_shareable_link, creation_source,
        subscription_plan_id, privacy_mode_enabled
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      await stmt.run(
        crypto.randomUUID(), // new history entry id
        doc.id, // original document id
        doc.title,
        doc.created_at,
        doc.updated_at,
        doc.deleted_at,
        doc.user_id,
        doc.notes_markdown,
        doc.notes_plain,
        doc.transcribe,
        doc.public,
        doc.type,
        doc.valid_meeting,
        doc.has_shareable_link,
        doc.creation_source,
        doc.subscription_plan_id,
        doc.privacy_mode_enabled
      );

      debug('history-tracker', 'Historical record created', {
        documentId: doc.id,
        title: doc.title
      });
    } catch (error) {
      logger.error('Error tracking document history:', error);
      throw error;
    }
  }

  async getDocumentHistory(documentId: string) {
    return this.db.prepare(`
      SELECT * FROM historical_documents
      WHERE document_id = ?
      ORDER BY history_timestamp DESC
    `).all(documentId);
  }
}