import { Database } from 'bun:sqlite';
import { debug } from '../utils/logger';
import type { TranscriptEntry } from '../models/types';

export class TranscriptService {
  private preparedStatements: {
    upsertTranscript?: any;
  } = {};

  constructor(private db: Database) {
    this.initializePreparedStatements();
  }

  private initializePreparedStatements() {
    this.preparedStatements.upsertTranscript = this.db.prepare(`
      INSERT INTO transcript_entries (
        id, document_id, text, source, speaker,
        start_timestamp, end_timestamp, is_final, sequence_number
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        text = excluded.text,
        is_final = excluded.is_final
    `);
  }

  upsertTranscriptEntry(docId: string, entry: TranscriptEntry) {
    debug('TranscriptService', 'Upserting transcript entry', {
      id: entry.id,
      docId,
      speaker: entry.speaker
    });

    return this.preparedStatements.upsertTranscript.run(
      entry.id,
      docId,
      entry.text,
      entry.source,
      entry.speaker,
      entry.start_timestamp,
      entry.end_timestamp,
      entry.is_final,
      entry.sequence_number
    );
  }
}