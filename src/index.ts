import { watch } from 'fs';
import { join } from 'path';
import { logger, debug } from './utils/logger';
import { DatabaseConnection } from './database/connection';
import { HistoryService } from './services/HistoryService';
import { DocumentService } from './services/DocumentService';
import { CalendarService } from './services/CalendarService';
import { TranscriptService } from './services/TranscriptService';
import { PersonService } from './services/PersonService';
import { TemplateService } from './services/TemplateService';
import { StateTrackingService } from './services/StateTrackingService';
import type { Document, CalendarEvent, Person, TranscriptEntry } from './models/types';
import * as crypto from 'crypto';

class MeetingDataIngestor {
  private static readonly CHUNK_SIZE = 100;
  private dbPath: string;
  private cachePath: string;

  private historyService: HistoryService;
  private documentService: DocumentService;
  private calendarService: CalendarService;
  private transcriptService: TranscriptService;
  private personService: PersonService;
  private templateService: TemplateService;
  private stateTrackingService: StateTrackingService;

  constructor(dbPath: string, cachePath: string) {
    this.dbPath = dbPath;
    this.cachePath = cachePath;

    const db = DatabaseConnection.getInstance(dbPath);
    this.historyService = new HistoryService(db);
    this.documentService = new DocumentService(db);
    this.calendarService = new CalendarService(db);
    this.transcriptService = new TranscriptService(db);
    this.personService = new PersonService(db);
    this.templateService = new TemplateService(db);
    this.stateTrackingService = new StateTrackingService();
  }

  public async startMonitoring() {
    logger.info(`Starting to monitor cache file at ${this.cachePath}`);
    debug('monitor', 'Starting file monitor', {
      cachePath: this.cachePath,
      dbPath: this.dbPath
    });

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
        debug('file-change', 'Cache file modified', {
          eventType,
          file: this.cachePath
        });

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
      // Close DB if needed: DatabaseConnection.getInstance(...) has no explicit close
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

      // The original code had a double JSON.parse approach.
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

    let documents: Document[] = [];
    if (Array.isArray(data.state.documents)) {
      documents = data.state.documents;
    } else {
      documents = Object.values(data.state.documents);
    }

    logger.info(`Processing ${documents.length} documents`);

    for (let i = 0; i < documents.length; i += MeetingDataIngestor.CHUNK_SIZE) {
      const chunk = documents.slice(i, i + MeetingDataIngestor.CHUNK_SIZE);
      await this.processChunk(chunk, data);
    }

    logger.info('Cache processing complete');
  }

  private async processChunk(chunk: Document[], data: any) {
    // We handle everything inside a DB transaction
    const db = DatabaseConnection.getInstance(this.dbPath);
    db.transaction(() => {
      for (const doc of chunk) {
        (async () => {
          // Document changes
          if (await this.stateTrackingService.hasDocumentChanged(doc)) {
            this.historyService.trackDocumentHistory(doc);
            this.documentService.upsertDocument(doc);
          }

          // Calendar event changes
          if (doc.google_calendar_event) {
            const eventObj = doc.google_calendar_event;
            eventObj.document_id = doc.id; // Ensure docId is set
            if (await this.stateTrackingService.hasCalendarEventChanged(doc.id, eventObj)) {
              this.calendarService.upsertCalendarEvent(eventObj);

              if (eventObj.attendees) {
                for (const attendee of eventObj.attendees) {
                  const person = {
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
                  if (await this.stateTrackingService.hasPersonChanged(doc.id, person)) {
                    this.personService.upsertPerson(person);
                  }
                }
              }
            }
          }

          // Transcript changes
          if (data.state.transcripts?.[doc.id]) {
            const entries: TranscriptEntry[] = data.state.transcripts[doc.id];
            for (const entry of entries) {
              if (await this.stateTrackingService.hasTranscriptChanged(doc.id, entry)) {
                this.transcriptService.upsertTranscriptEntry(doc.id, entry);
              }
            }
          }

          // (If the cache has templates or similar data, upsert them here)
          if (data.state.templates?.[doc.id]) {
            const templateRecords = data.state.templates[doc.id];
            // Example structure depends on your actual data shape
            if (templateRecords.panel_templates) {
              for (const panelTemplate of templateRecords.panel_templates) {
                this.templateService.upsertPanelTemplate(panelTemplate);
              }
            }
            if (templateRecords.template_sections) {
              for (const section of templateRecords.template_sections) {
                this.templateService.upsertTemplateSection(section);
              }
            }
            if (templateRecords.document_panels) {
              for (const panel of templateRecords.document_panels) {
                // Make sure doc ID is set if needed
                panel.document_id = doc.id;
                this.templateService.upsertDocumentPanel(panel);
              }
            }
          }
        })().catch(err => logger.error('Error processing doc in chunk:', err));
      }
    })();
  }
}

// Entry point
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