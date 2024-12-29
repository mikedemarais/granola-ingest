import * as crypto from 'crypto';
import { watch } from 'fs';
import { join } from 'path';
import { DatabaseConnection } from './database/connection';
import type { Document, Person, TranscriptEntry } from './models/types';
import { CalendarService } from './services/CalendarService';
import { DocumentService } from './services/DocumentService';
import { HistoryService } from './services/HistoryService';
import { PersonService } from './services/PersonService';
import { StateTrackingService } from './services/StateTrackingService';
import {
  TemplateService,
  type DocumentPanel,
  type PanelTemplate,
  type TemplateSection,
} from './services/TemplateService';
import { TranscriptService } from './services/TranscriptService';
import { debug, logger } from './utils/logger';

class MeetingDataIngestor {
  private static readonly CHUNK_SIZE = 100;
  private dbPath: string;
  private cachePath: string;
  private watcher: ReturnType<typeof watch> | null = null;

  private historyService!: HistoryService;
  private documentService!: DocumentService;
  private calendarService!: CalendarService;
  private transcriptService!: TranscriptService;
  private personService!: PersonService;
  private templateService!: TemplateService;
  private readonly stateTrackingService: StateTrackingService;

  constructor(dbPath: string, cachePath: string) {
    this.dbPath = dbPath;
    this.cachePath = cachePath;
    this.stateTrackingService = new StateTrackingService();
  }

  private async initializeServices(): Promise<void> {
    try {
      // Get database instance - this ensures schemas are initialized
      const db = await DatabaseConnection.getInstance(this.dbPath);

      // Initialize services
      this.historyService = new HistoryService(db);
      this.documentService = new DocumentService(db);
      this.calendarService = new CalendarService(db);
      this.transcriptService = new TranscriptService(db);
      this.personService = new PersonService(db);
      this.templateService = new TemplateService(db);

      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error('Service initialization failed:', error);
      throw new Error(`Failed to initialize services: ${(error as Error).message}`);
    }
  }

  private async readAndParseCache(): Promise<any> {
    try {
      debug('cache-reader', 'Reading cache file', { path: this.cachePath });
      const cacheContent = await Bun.file(this.cachePath).text();

      if (!cacheContent) {
        throw new Error('Cache file is empty');
      }

      debug('cache-content', 'Read cache content', {
        bytesRead: cacheContent.length,
        preview: cacheContent.slice(0, 100),
      });

      const parsedCache = JSON.parse(cacheContent);
      if (!parsedCache.cache) {
        throw new Error('Invalid cache format - missing cache property');
      }

      const innerCache = JSON.parse(parsedCache.cache);
      debug('parsed-cache', 'Cache structure analysis', {
        hasState: !!innerCache.state,
        documentCount: innerCache.state?.documents
          ? Object.keys(innerCache.state.documents).length
          : 0,
      });

      return innerCache;
    } catch (error) {
      logger.error('Error reading or parsing cache file:', error);
      throw error;
    }
  }

  private async processCache(data: any): Promise<void> {
    if (!data?.state?.documents) {
      logger.error('Invalid cache data structure:', {
        hasState: !!data?.state,
        stateType: typeof data?.state,
        hasDocuments: !!data?.state?.documents,
      });
      throw new Error('Invalid cache data structure - missing state.documents');
    }

    const documents: Document[] = Array.isArray(data.state.documents)
      ? data.state.documents
      : Object.values(data.state.documents);

    logger.info(`Processing ${documents.length} documents`);

    for (let i = 0; i < documents.length; i += MeetingDataIngestor.CHUNK_SIZE) {
      const chunk = documents.slice(i, i + MeetingDataIngestor.CHUNK_SIZE);
      await this.processChunk(chunk, data);
      logger.info(
        `Processed chunk ${Math.floor(i / MeetingDataIngestor.CHUNK_SIZE) + 1} of ${Math.ceil(documents.length / MeetingDataIngestor.CHUNK_SIZE)}`
      );
    }
  }

  private async processChunk(chunk: Document[], data: any): Promise<void> {
    try {
      const db = await DatabaseConnection.getInstance(this.dbPath);

      await db.transaction(() => {
        return Promise.all(
          chunk.map(async (doc) => {
            try {
              // Document changes
              if (await this.stateTrackingService.hasDocumentChanged(doc)) {
                await this.historyService.trackDocumentHistory(doc);
                await this.documentService.upsertDocument(doc);
              }

              // Calendar event changes
              if (doc.google_calendar_event) {
                const eventObj = doc.google_calendar_event;
                eventObj.document_id = doc.id;
                if (await this.stateTrackingService.hasCalendarEventChanged(doc.id, eventObj)) {
                  await this.calendarService.upsertCalendarEvent(eventObj);

                  if (eventObj.attendees) {
                    await Promise.all(
                      eventObj.attendees.map(async (attendee) => {
                        const person: Person = {
                          id: crypto.randomUUID(),
                          document_id: doc.id,
                          email: attendee.email,
                          name: attendee.displayName || null,
                          role: attendee.organizer ? 'organizer' : 'attendee',
                          response_status: attendee.responseStatus || null,
                          avatar_url: null,
                          company_name: null,
                          job_title: null,
                        };
                        if (await this.stateTrackingService.hasPersonChanged(doc.id, person)) {
                          await this.personService.upsertPerson(person);
                        }
                      })
                    );
                  }
                }
              }

              // Transcript changes
              if (data.state.transcripts?.[doc.id]) {
                const entries: TranscriptEntry[] = data.state.transcripts[doc.id];
                await Promise.all(
                  entries.map(async (entry) => {
                    if (await this.stateTrackingService.hasTranscriptChanged(doc.id, entry)) {
                      await this.transcriptService.upsertTranscriptEntry(doc.id, entry);
                    }
                  })
                );
              }

              // Template changes
              if (data.state.templates?.[doc.id]) {
                const templateRecords = data.state.templates[doc.id];

                if (templateRecords.panel_templates) {
                  await Promise.all(
                    templateRecords.panel_templates.map((template: PanelTemplate) =>
                      this.templateService.upsertPanelTemplate(template)
                    )
                  );
                }

                if (templateRecords.template_sections) {
                  await Promise.all(
                    templateRecords.template_sections.map((section: TemplateSection) =>
                      this.templateService.upsertTemplateSection(section)
                    )
                  );
                }

                if (templateRecords.document_panels) {
                  await Promise.all(
                    templateRecords.document_panels.map((panel: DocumentPanel) => {
                      panel.document_id = doc.id;
                      return this.templateService.upsertDocumentPanel(panel);
                    })
                  );
                }
              }
            } catch (error) {
              logger.error(`Error processing document ${doc.id}:`, error);
              throw error;
            }
          })
        );
      })();
    } catch (error) {
      logger.error('Error in processChunk:', error);
      throw error;
    }
  }

  private setupCleanup(): void {
    const cleanup = async () => {
      await this.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception:', error);
      await this.cleanup();
      process.exit(1);
    });
  }

  private async cleanup(): Promise<void> {
    logger.info('Cleaning up...');
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    DatabaseConnection.closeConnection();
  }

  public async startMonitoring(): Promise<void> {
    try {
      logger.info(`Starting to monitor cache file at ${this.cachePath}`);
      debug('monitor', 'Starting file monitor', {
        cachePath: this.cachePath,
        dbPath: this.dbPath,
      });

      // Initialize services
      await this.initializeServices();

      // Process initial cache
      const data = await this.readAndParseCache();
      await this.processCache(data);
      logger.info('Initial cache processing complete');

      // Set up file watcher
      this.watcher = watch(this.cachePath, async (eventType) => {
        if (eventType === 'change') {
          logger.info('Cache file changed, processing updates...');
          try {
            const data = await this.readAndParseCache();
            await this.processCache(data);
            logger.info('Cache update processing complete');
          } catch (error) {
            logger.error('Error processing cache update:', error);
          }
        }
      });

      // Set up cleanup handlers
      this.setupCleanup();
    } catch (error) {
      logger.error('Fatal error in startMonitoring:', error);
      await this.cleanup();
      throw error;
    }
  }
}

export { MeetingDataIngestor };

// Entry point
const HOME = process.env.HOME || process.env.USERPROFILE || '';
if (!HOME) {
  logger.error('Unable to determine home directory');
  process.exit(1);
}

const CACHE_FILE_PATH = join(HOME, 'Library', 'Application Support', 'Granola', 'cache-v3.json');
if (!process.env.DB_PATH) {
  logger.error('DB_PATH environment variable is required');
  process.exit(1);
}

const ingestor = new MeetingDataIngestor(process.env.DB_PATH, CACHE_FILE_PATH);
ingestor.startMonitoring().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
