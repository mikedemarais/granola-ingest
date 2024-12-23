import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger';
import { allSchemas } from './schema';

class DatabaseConnection {
  private static instance: Database | null = null;

  static getInstance(dbPath: string): Database {
    if (!this.instance) {
      const dbDir = dirname(dbPath);
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }
      if (!existsSync('./logs')) {
        mkdirSync('./logs');
      }
      this.instance = new Database(dbPath);
      this.initializeSchemas(this.instance);
    }
    return this.instance;
  }

  private static initializeSchemas(db: Database) {
    db.transaction(() => {
      for (const schema of allSchemas) {
        try {
          db.run(schema);
        } catch (err) {
          logger.error('Error creating database schema:', err);
          throw err;
        }
      }
    })();
    logger.info('Database schemas initialized');
  }
}

export { DatabaseConnection };