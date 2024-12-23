import { Database } from 'bun:sqlite';
import { debug } from '../utils/logger';
import type { Document } from '../models/types';

export class DocumentService {
  private preparedStatements: {
    upsert?: any;
  } = {};

  constructor(private db: Database) {
    this.initializePreparedStatements();
  }

  private initializePreparedStatements() {
    this.preparedStatements.upsert = this.db.prepare(`
      INSERT INTO documents (
        id, title, created_at, updated_at, deleted_at,
        user_id, notes_markdown, notes_plain, transcribe, public,
        type, valid_meeting, has_shareable_link, creation_source,
        subscription_plan_id, privacy_mode_enabled
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        title = excluded.title,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at,
        notes_markdown = excluded.notes_markdown,
        notes_plain = excluded.notes_plain,
        public = excluded.public,
        valid_meeting = excluded.valid_meeting,
        has_shareable_link = excluded.has_shareable_link,
        privacy_mode_enabled = excluded.privacy_mode_enabled
    `);
  }

  upsertDocument(doc: Document) {
    debug('DocumentService', 'Upserting document', {
      id: doc.id,
      title: doc.title
    });

    return this.preparedStatements.upsert.run(
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
  }
}