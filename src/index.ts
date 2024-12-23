import { Database } from 'bun:sqlite';
import { watch, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { debug, logger } from './utils/logger';
import { HistoryTracker } from './History';
import { HashUtil } from './utils/hash'; 
import type { Document, CalendarEvent, Person, TranscriptEntry } from './types';
import * as crypto from 'crypto';

class MeetingDataIngestor {
  private static readonly CHUNK_SIZE = 100;
  private db: Database;
  private cachePath: string;
  private dbPath: string;
  private historyTracker: HistoryTracker;
  
  private preparedStatements: {
    documentUpsert?: any;
    calendarUpsert?: any;
    transcriptUpsert?: any;
    personUpsert?: any;
    templateUpsert?: any;
    panelUpsert?: any;
    templateSectionUpsert?: any;
  } = {};

  private lastKnownState: {
    documentHashes: { [key: string]: string };
    transcriptHashes: { [key: string]: { [key: string]: string } };
    templateHashes: { [key: string]: string };
    calendarHashes: { [key: string]: string };
    personHashes: { [key: string]: { [key: string]: string } };
  } = {
    documentHashes: {},
    transcriptHashes: {},
    templateHashes: {},
    calendarHashes: {},
    personHashes: {}
  };

  constructor(dbPath: string, cachePath: string) {
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    
    const logsDir = './logs';
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir);
    }
    
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.cachePath = cachePath;
    this.historyTracker = new HistoryTracker(this.db);
    
    this.initializeDatabase();
    this.initializePreparedStatements();
  }

  private initializeDatabase() {
    const schemas = [
      // Core meeting/document table
      `CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY,
        title TEXT,
        created_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE,
        deleted_at TIMESTAMP WITH TIME ZONE,
        user_id UUID,
        notes_markdown TEXT,
        notes_plain TEXT,
        transcribe BOOLEAN DEFAULT FALSE,
        public BOOLEAN DEFAULT FALSE,
        type TEXT,
        valid_meeting BOOLEAN DEFAULT TRUE,
        has_shareable_link BOOLEAN DEFAULT FALSE,
        creation_source TEXT,
        subscription_plan_id TEXT,
        privacy_mode_enabled BOOLEAN DEFAULT FALSE
      )`,

      // Calendar integration
      `CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        document_id UUID REFERENCES documents(id),
        summary TEXT,
        description TEXT,
        start_time TIMESTAMP WITH TIME ZONE,
        end_time TIMESTAMP WITH TIME ZONE,
        timezone TEXT,
        status TEXT,
        calendar_id TEXT,
        html_link TEXT,
        hangout_link TEXT,
        location TEXT,
        organizer_email TEXT,
        created_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE
      )`,

      // Meeting participants
      `CREATE TABLE IF NOT EXISTS people (
        id UUID PRIMARY KEY,
        document_id UUID REFERENCES documents(id),
        email TEXT,
        name TEXT,
        role TEXT,
        response_status TEXT,
        avatar_url TEXT,
        company_name TEXT,
        job_title TEXT
      )`,

      // Transcripts
      `CREATE TABLE IF NOT EXISTS transcript_entries (
        id UUID PRIMARY KEY,
        document_id UUID REFERENCES documents(id),
        text TEXT,
        source TEXT,
        speaker TEXT,
        start_timestamp TIMESTAMP WITH TIME ZONE,
        end_timestamp TIMESTAMP WITH TIME ZONE,
        is_final BOOLEAN,
        sequence_number INTEGER
      )`,

      // Note templates
      `CREATE TABLE IF NOT EXISTS panel_templates (
        id UUID PRIMARY KEY,
        category TEXT,
        title TEXT,
        description TEXT,
        color TEXT,
        symbol TEXT,
        is_granola BOOLEAN,
        created_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE,
        deleted_at TIMESTAMP WITH TIME ZONE,
        shared_with TEXT,
        user_types JSONB
      )`,

      // Template sections
      `CREATE TABLE IF NOT EXISTS template_sections (
        id UUID PRIMARY KEY,
        template_id UUID REFERENCES panel_templates(id),
        heading TEXT,
        section_description TEXT,
        sequence_number INTEGER
      )`,

      // Document panels
      `CREATE TABLE IF NOT EXISTS document_panels (
        id UUID PRIMARY KEY,
        document_id UUID REFERENCES documents(id),
        template_id UUID REFERENCES panel_templates(id),
        content JSONB,
        created_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE
      )`,

      // Calendar configurations
      `CREATE TABLE IF NOT EXISTS calendars (
        id TEXT PRIMARY KEY,
        summary TEXT,
        time_zone TEXT,
        access_role TEXT,
        background_color TEXT,
        foreground_color TEXT,
        primary_calendar BOOLEAN,
        selected BOOLEAN,
        conference_properties JSONB
      )`,

      // Indexes
      `CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_transcript_entries_document_id ON transcript_entries(document_id)`,
      `CREATE INDEX IF NOT EXISTS idx_document_panels_document_id ON document_panels(document_id)`,
      `CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time)`
    ];

    this.db.transaction(() => {
      for (const schema of schemas) {
        try {
          this.db.run(schema);
        } catch (error) {
          logger.error('Error creating database schema:', error);
          throw error;
        }
      }
    })();

    logger.info('Database initialized');
  }

  private initializePreparedStatements() {
    try {
      this.preparedStatements.documentUpsert = this.db.prepare(`
        INSERT INTO documents (
          id, title, created_at, updated_at, deleted_at, user_id,
          notes_markdown, notes_plain, transcribe, public, type,
          valid_meeting, has_shareable_link, creation_source,
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

      this.preparedStatements.calendarUpsert = this.db.prepare(`
        INSERT INTO calendar_events (
          id, document_id, summary, description, start_time, end_time,
          timezone, status, calendar_id, html_link, hangout_link,
          location, organizer_email, created_at, updated_at
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

      this.preparedStatements.transcriptUpsert = this.db.prepare(`
        INSERT INTO transcript_entries (
          id, document_id, text, source, speaker,
          start_timestamp, end_timestamp, is_final, sequence_number
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          text = excluded.text,
          is_final = excluded.is_final
      `);

      this.preparedStatements.personUpsert = this.db.prepare(`
        INSERT INTO people (
          id, document_id, email, name, role,
          response_status, avatar_url, company_name, job_title
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          email = excluded.email,
          name = excluded.name,
          role = excluded.role,
          response_status = excluded.response_status,
          avatar_url = excluded.avatar_url,
          company_name = excluded.company_name,
          job_title = excluded.job_title
      `);

      this.preparedStatements.templateUpsert = this.db.prepare(`
        INSERT INTO panel_templates (
          id, category, title, description, color, symbol,
          is_granola, created_at, updated_at, deleted_at,
          shared_with, user_types
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          category = excluded.category,
          title = excluded.title,
          description = excluded.description,
          color = excluded.color,
          symbol = excluded.symbol,
          updated_at = excluded.updated_at,
          deleted_at = excluded.deleted_at,
          shared_with = excluded.shared_with,
          user_types = excluded.user_types
      `);
    } catch (error) {
      logger.error('Error preparing statements:', error);
      throw error;
    }
  }

  // (2) Replace the old getHash with an async method
  private async getHash(obj: any): Promise<string> {
    return HashUtil.getHash(JSON.stringify(obj));
  }

  // (3) Make change detection methods async
  private async hasDocumentChanged(doc: Document): Promise<boolean> {
    const hash = await this.getHash(doc);
    const changed = hash !== this.lastKnownState.documentHashes[doc.id];
    if (changed) {
      this.lastKnownState.documentHashes[doc.id] = hash;
    }
    return changed;
  }

  private async hasCalendarEventChanged(docId: string, event: CalendarEvent): Promise<boolean> {
    const hash = await this.getHash(event);
    const changed = hash !== this.lastKnownState.calendarHashes[docId];
    if (changed) {
      this.lastKnownState.calendarHashes[docId] = hash;
    }
    return changed;
  }

  private async hasTranscriptChanged(docId: string, entry: any): Promise<boolean> {
    const hash = await this.getHash(entry);
    const docTranscripts = this.lastKnownState.transcriptHashes[docId] || {};
    const changed = hash !== docTranscripts[entry.id];
    if (changed) {
      if (!this.lastKnownState.transcriptHashes[docId]) {
        this.lastKnownState.transcriptHashes[docId] = {};
      }
      this.lastKnownState.transcriptHashes[docId][entry.id] = hash;
    }
    return changed;
  }

  private async processChunk(chunk: Document[], data: any) {
    try {
      // Prepare all changes for this chunk
      const changes = await Promise.all(
        chunk.map(async doc => {
          // We'll store docId separately so transcripts can update
          // even if the doc itself is unchanged.
          const docChanges = {
            documentId: doc.id,
            document: null as Document | null,
            calendar: null as CalendarEvent | null,
            transcripts: [] as TranscriptEntry[],
            people: [] as Person[]
          };

          // Check document changes
          if (await this.hasDocumentChanged(doc)) {
            docChanges.document = doc;
          }

          // Check calendar changes
          if (doc.google_calendar_event && 
              (await this.hasCalendarEventChanged(doc.id, doc.google_calendar_event))) {
            docChanges.calendar = doc.google_calendar_event;
            
            // (4) Update the attendee code to use proper UUIDs
            if (doc.google_calendar_event.attendees) {
              for (const attendee of doc.google_calendar_event.attendees) {
                const person: Person = {
                  id: crypto.randomUUID(),
                  document_id: doc.id,
                  email: attendee.email,
                  name: attendee.displayName,
                  role: attendee.organizer ? 'organizer' : 'attendee',
                  response_status: attendee.responseStatus,
                  avatar_url: null,
                  company_name: null,
                  job_title: null
                };
                
                const personHash = await this.getHash(person);
                const personChanged = personHash !== this.lastKnownState.personHashes[doc.id]?.[person.id];
              
                if (personChanged) {
                  if (!this.lastKnownState.personHashes[doc.id]) {
                    this.lastKnownState.personHashes[doc.id] = {};
                  }
                  this.lastKnownState.personHashes[doc.id][person.id] = personHash;
                  docChanges.people.push(person);
                }
              }
            }
          }

          // Check transcript changes
          if (data.state.transcripts?.[doc.id]) {
            const entries = data.state.transcripts[doc.id] as TranscriptEntry[];
            const changedEntries: TranscriptEntry[] = [];
            for (const entry of entries) {
              if (await this.hasTranscriptChanged(doc.id, entry)) {
                changedEntries.push(entry);
              }
            }
            docChanges.transcripts = changedEntries;
          }

          return docChanges;
        })
      );

      // Execute all changes in a single transaction
      this.db.transaction(() => {
        for (const change of changes) {
          if (change.document) {
            this.historyTracker.trackDocumentHistory(change.document);
            this.upsertDocument(change.document);
          }
          
          if (change.calendar) {
            this.upsertCalendarEvent({
              ...change.calendar,
              document_id: change.documentId
            });
          }
          
          for (const person of change.people) {
            this.upsertPerson(person);
          }
          
          for (const transcript of change.transcripts) {
            this.upsertTranscriptEntry(change.documentId, transcript);
          }
        }
      })();

    } catch (error) {
      logger.error('Error processing chunk:', error);
      throw error;
    }
  }

  public async startMonitoring() {
    logger.info(`Starting to monitor cache file at ${this.cachePath}`);
    debug('monitor', 'Starting file monitor', { cachePath: this.cachePath, dbPath: this.dbPath });

    try {
      const data = await this.readAndParseCache();
      await this.processCache(data);
      logger.info('Initial cache processing complete');
    } catch (error) {
      logger.error('Error during initial cache processing:', error);
    }

    const watcher = watch(this.cachePath, async (eventType) => {
      if (eventType === 'change') {
        logger.info('Cache file changed, processing updates...');
        debug('file-change', 'Cache file modified', { eventType, file: this.cachePath });
        
        try {
          const data = await this.readAndParseCache();
          await this.processCache(data);
          logger.info('Cache update processing complete');
        } catch (error) {
          logger.error('Error processing cache update:', error);
        }
      }
    });

    process.on('SIGINT', () => {
      logger.info('Shutting down...');
      watcher.close();
      this.db.close();
      process.exit(0);
    });
  }

  private async readAndParseCache(): Promise<any> {
    try {
      debug('cache-reader', 'Reading cache file', { path: this.cachePath });
      const cacheContent = await Bun.file(this.cachePath).text();
      
      debug('cache-content', 'Parsed cache content', {
        bytesRead: cacheContent.length,
        preview: cacheContent.slice(0, 100)
      });
      
      const parsedCache = JSON.parse(cacheContent);
      const innerCache = JSON.parse(parsedCache.cache);

      debug('parsed-cache', 'Cache structure analysis', {
        hasState: !!innerCache.state
      });
      
      return innerCache;
    } catch (error) {
      logger.error('Error reading or parsing cache file:', error);
      throw error;
    }
  }

  private async processCache(data: any) {
    if (!data?.state?.documents) {
      logger.error('Invalid cache data structure:', {
        hasState: !!data?.state,
        stateType: typeof data?.state,
        hasDocuments: !!data?.state?.documents
      });
      throw new Error('Invalid cache data structure - missing state.documents');
    }

    const documents = typeof data.state.documents === 'object' 
      ? Object.values(data.state.documents) 
      : data.state.documents;

    if (!Array.isArray(documents)) {
      logger.error('Failed to convert documents to array:', {
        documentsType: typeof documents
      });
      throw new Error('Invalid cache data structure - could not process documents');
    }

    logger.info(`Processing ${documents.length} documents`);

    // Break documents up into chunks
    for (let i = 0; i < documents.length; i += MeetingDataIngestor.CHUNK_SIZE) {
      const chunk = documents.slice(i, i + MeetingDataIngestor.CHUNK_SIZE);
      await this.processChunk(chunk, data);
    }

    logger.info('Cache processing complete');
  }

  private upsertDocument(doc: Document) {
    debug('db', 'Upserting document', { id: doc.id, title: doc.title });
    
    return this.preparedStatements.documentUpsert.run(
      doc.id, doc.title, doc.created_at, doc.updated_at, doc.deleted_at,
      doc.user_id, doc.notes_markdown, doc.notes_plain, doc.transcribe,
      doc.public, doc.type, doc.valid_meeting, doc.has_shareable_link,
      doc.creation_source, doc.subscription_plan_id, doc.privacy_mode_enabled
    );
  }

  private upsertCalendarEvent(event: CalendarEvent) {
    debug('db', 'Upserting calendar event', { id: event.id, summary: event.summary });
    
    return this.preparedStatements.calendarUpsert.run(
      event.id, event.document_id, event.summary, event.description,
      event.start_time, event.end_time, event.timezone, event.status,
      event.calendar_id, event.html_link, event.hangout_link,
      event.location, event.organizer_email, event.created_at, event.updated_at
    );
  }

  private upsertTranscriptEntry(docId: string, entry: TranscriptEntry) {
    debug('db', 'Upserting transcript entry', { 
      id: entry.id, 
      docId, 
      speaker: entry.speaker 
    });
    
    return this.preparedStatements.transcriptUpsert.run(
      entry.id, docId, entry.text, entry.source, entry.speaker,
      entry.start_timestamp, entry.end_timestamp, entry.is_final,
      entry.sequence_number
    );
  }

  private upsertPerson(person: Person) {
    debug('db', 'Upserting person', { 
      docId: person.document_id, 
      email: person.email, 
      role: person.role 
    });
    
    return this.preparedStatements.personUpsert.run(
      person.id,
      person.document_id,
      person.email,
      person.name,
      person.role,
      person.response_status,
      person.avatar_url,
      person.company_name,
      person.job_title
    );
  }
}

// Application entry point
const HOME = process.env.HOME || process.env.USERPROFILE || '';
const CACHE_FILE_PATH = join(HOME, 'Library', 'Application Support', 'Granola', 'cache-v3.json');

if (!process.env.DB_PATH) {
  throw new Error('DB_PATH environment variable is required');
}

const ingestor = new MeetingDataIngestor(process.env.DB_PATH, CACHE_FILE_PATH);
ingestor.startMonitoring().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});