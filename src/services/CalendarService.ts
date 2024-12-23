import { Database } from 'bun:sqlite';
import { debug } from '../utils/logger';
import type { CalendarEvent } from '../models/types';

export class CalendarService {
  private preparedStatements: {
    upsertEvent?: any;
  } = {};

  constructor(private db: Database) {
    this.initializePreparedStatements();
  }

  private initializePreparedStatements() {
    this.preparedStatements.upsertEvent = this.db.prepare(`
      INSERT INTO calendar_events (
        id, document_id, summary, description, start_time,
        end_time, timezone, status, calendar_id, html_link,
        hangout_link, location, organizer_email, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        summary = excluded.summary,
        description = excluded.description,
        start_time = excluded.start_time,
        end_time = excluded.end_time,
        status = excluded.status,
        updated_at = excluded.updated_at
    `);
  }

  upsertCalendarEvent(event: CalendarEvent) {
    debug('CalendarService', 'Upserting calendar event', {
      id: event.id,
      summary: event.summary
    });

    return this.preparedStatements.upsertEvent.run(
      event.id,
      event.document_id,
      event.summary,
      event.description,
      event.start_time,
      event.end_time,
      event.timezone,
      event.status,
      event.calendar_id,
      event.html_link,
      event.hangout_link,
      event.location,
      event.organizer_email,
      event.created_at,
      event.updated_at
    );
  }
}