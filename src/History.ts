import { Database } from 'bun:sqlite';
import { debug, logger } from './utils/logger';
import { HashUtil } from './utils/hash';
import type { Document } from './types';

export class HistoryTracker {
  private preparedStatements: {
    insertHistory?: any;
    getLatestHash?: any;
    updateHash?: any;
    getDocument?: any;
  } = {};

  constructor(private db: Database) {
    this.initializeHistoryTables();
    this.initializePreparedStatements();
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
      
      `CREATE TABLE IF NOT EXISTS document_state_hashes (
        document_id UUID PRIMARY KEY,
        content_hash TEXT NOT NULL,
        last_change TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        changed_fields TEXT,
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )`,
      
      `CREATE INDEX IF NOT EXISTS idx_document_state_hashes_hash 
       ON document_state_hashes(content_hash)`
    ];

    this.db.transaction(() => {
      for (const schema of schemas) {
        try {
          this.db.run(schema);
        } catch (error) {
          logger.error('Error creating history tables:', error);
          throw error;
        }
      }
    })();

    logger.info('History tables initialized');
  }

  private initializePreparedStatements() {
    try {
      this.preparedStatements.insertHistory = this.db.prepare(`
        INSERT INTO historical_documents (
          id, document_id, title, created_at, updated_at, deleted_at,
          user_id, notes_markdown, notes_plain, transcribe, public,
          type, valid_meeting, has_shareable_link, creation_source,
          subscription_plan_id, privacy_mode_enabled
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      this.preparedStatements.getLatestHash = this.db.prepare(`
        SELECT content_hash, changed_fields
        FROM document_state_hashes 
        WHERE document_id = ?
      `);

      this.preparedStatements.updateHash = this.db.prepare(`
        INSERT INTO document_state_hashes (document_id, content_hash, changed_fields)
        VALUES (?, ?, ?)
        ON CONFLICT (document_id) DO UPDATE SET 
          content_hash = excluded.content_hash,
          changed_fields = excluded.changed_fields,
          last_change = CURRENT_TIMESTAMP
      `);

      this.preparedStatements.getDocument = this.db.prepare(`
        SELECT * FROM documents WHERE id = ?
      `);
    } catch (error) {
      logger.error('Error preparing statements:', error);
      throw error;
    }
  }

  private async getDocumentHash(doc: Document): Promise<string> {
    if (!doc) {
      throw new Error('Invalid document provided to getDocumentHash');
    }

    const hashInput = [
      doc.title || '',
      doc.notes_markdown || '',
      doc.notes_plain || '',
      doc.updated_at || '',
      doc.deleted_at || '',
      doc.public ? '1' : '0',
      doc.valid_meeting ? '1' : '0',
      doc.has_shareable_link ? '1' : '0',
      doc.privacy_mode_enabled ? '1' : '0'
    ].join('|');

    return HashUtil.getHash(hashInput);
  }

  private async detectChangedFields(doc: Document, lastHash: string | null): Promise<string[]> {
    if (!lastHash) {
      return ['initial_creation'];
    }

    const currentHash = await this.getDocumentHash(doc);
    if (lastHash === currentHash) {
      return [];
    }

    const lastDoc = this.getDocumentFromId(doc.id);
    if (!lastDoc) {
      return ['data_changed'];
    }

    const fieldsToCheck = [
      'title', 'notes_markdown', 'notes_plain', 'updated_at', 
      'deleted_at', 'public', 'valid_meeting', 
      'has_shareable_link', 'privacy_mode_enabled'
    ] as const;

    return fieldsToCheck.filter(field => 
      doc[field] !== lastDoc[field] && 
      (doc[field] !== null || lastDoc[field] !== null)
    );
  }

  private getDocumentFromId(documentId: string): Document | null {
    try {
      return this.preparedStatements.getDocument.get(documentId) as Document | null;
    } catch (error) {
      logger.error('Error fetching document:', error);
      return null;
    }
  }

  async trackDocumentHistory(doc: Document): Promise<boolean> {
    if (!doc?.id) {
      logger.error('Invalid document provided to trackDocumentHistory');
      return false;
    }

    try {
      const result = this.preparedStatements.getLatestHash.get(doc.id);
      const lastHash = result?.content_hash;
      const changedFields = await this.detectChangedFields(doc, lastHash);
      
      if (changedFields.length === 0) {
        debug('history-tracker', 'No changes detected, skipping history entry', {
          documentId: doc.id,
          title: doc.title
        });
        return false;
      }

      const currentHash = await this.getDocumentHash(doc);

      this.db.transaction(() => {
        this.preparedStatements.updateHash.run(
          doc.id,
          currentHash,
          JSON.stringify(changedFields)
        );

        this.preparedStatements.insertHistory.run(
          crypto.randomUUID(),
          doc.id,
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
      })();

      debug('history-tracker', 'Historical record created', {
        documentId: doc.id,
        title: doc.title,
        changedFields
      });
      
      return true;
    } catch (error) {
      logger.error('Error tracking document history:', error);
      throw error;
    }
  }

  async getDocumentHistory(documentId: string) {
    if (!documentId) {
      throw new Error('Document ID is required');
    }

    try {
      return this.db.prepare(`
        SELECT * FROM historical_documents
        WHERE document_id = ?
        ORDER BY history_timestamp DESC
      `).all(documentId);
    } catch (error) {
      logger.error('Error fetching document history:', error);
      throw error;
    }
  }
}