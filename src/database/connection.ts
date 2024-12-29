import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { logger } from '../utils/logger';
import { allSchemas } from './schema';

class DatabaseConnection {
  private static instance: Database | null = null;
  private static schemasInitialized = false;

  static async getInstance(dbPath: string): Promise<Database> {
    if (!this.instance) {
      // Ensure database directory exists
      const dbDir = dirname(dbPath);
      try {
        if (!existsSync(dbDir)) {
          mkdirSync(dbDir, { recursive: true });
        }
        if (!existsSync('./logs')) {
          mkdirSync('./logs');
        }
      } catch (error) {
        logger.error('Failed to create necessary directories:', error);
        throw new Error(
          `Failed to create database directory: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      try {
        // Create database instance
        this.instance = new Database(dbPath, { create: true });

        // Initialize schemas if not already done
        if (!this.schemasInitialized) {
          await this.initializeSchemas(this.instance);
          this.schemasInitialized = true;
        }
      } catch (error) {
        logger.error('Failed to initialize database:', error);
        // Clean up if instance creation succeeded but schema init failed
        if (this.instance) {
          try {
            this.instance.close();
          } catch (closeError) {
            logger.error('Error while closing database after initialization failure:', closeError);
          }
          this.instance = null;
        }
        throw new Error(
          `Database initialization failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return this.instance;
  }

  private static async initializeSchemas(db: Database): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        db.transaction(() => {
          for (const schema of allSchemas) {
            try {
              db.run(schema);
            } catch (error) {
              logger.error('Error executing schema:', error, { schema });
              throw error; // This will trigger transaction rollback
            }
          }
        })();
        logger.info('Database schemas initialized successfully');
        resolve();
      } catch (error) {
        logger.error('Schema initialization failed:', error);
        reject(
          new Error(
            `Schema initialization failed: ${error instanceof Error ? error.message : String(error)}`
          )
        );
      }
    });
  }

  static closeConnection(): void {
    if (this.instance) {
      try {
        this.instance.close();
        this.instance = null;
        this.schemasInitialized = false;
        logger.info('Database connection closed successfully');
      } catch (error) {
        logger.error('Error closing database connection:', error);
        throw new Error(
          `Failed to close database connection: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}

export { DatabaseConnection };
