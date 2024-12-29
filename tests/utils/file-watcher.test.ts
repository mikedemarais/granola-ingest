import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { MeetingDataIngestor } from '../../src/index';

const TEST_CACHE_PATH = join(process.cwd(), 'test-cache.json');
const TEST_DB_PATH = join(process.cwd(), 'test-watch.db');

describe('File Watching and Processing', () => {
  let ingestor: MeetingDataIngestor;

  beforeAll(() => {
    // Clean up any existing test files
    if (existsSync(TEST_CACHE_PATH)) {
      unlinkSync(TEST_CACHE_PATH);
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    // Create initial cache file
    const initialCache = {
      cache: JSON.stringify({
        state: {
          documents: {
            'doc-123': {
              id: 'doc-123',
              title: 'Initial Meeting',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              content: 'Initial content',
            },
          },
        },
      }),
    };
    writeFileSync(TEST_CACHE_PATH, JSON.stringify(initialCache));
  });

  afterAll(() => {
    // Clean up test files
    if (existsSync(TEST_CACHE_PATH)) {
      unlinkSync(TEST_CACHE_PATH);
    }
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test('should process initial cache file', async () => {
    ingestor = new MeetingDataIngestor(TEST_DB_PATH, TEST_CACHE_PATH);

    // Start monitoring in the background
    const monitoringPromise = ingestor.startMonitoring();

    // Wait a bit for initial processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify the database has been populated
    const db = await import('bun:sqlite').then((sqlite) => new sqlite.Database(TEST_DB_PATH));
    const result = db.query('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    expect(result?.count).toBe(1);
  });

  test('should detect and process cache file changes', async () => {
    // Update cache file with new document
    const updatedCache = {
      cache: JSON.stringify({
        state: {
          documents: {
            'doc-123': {
              id: 'doc-123',
              title: 'Updated Meeting',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              content: 'Updated content',
            },
            'doc-456': {
              id: 'doc-456',
              title: 'New Meeting',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              content: 'New content',
            },
          },
        },
      }),
    };

    writeFileSync(TEST_CACHE_PATH, JSON.stringify(updatedCache));

    // Wait for file watch event to be processed
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify the database has been updated
    const db = await import('bun:sqlite').then((sqlite) => new sqlite.Database(TEST_DB_PATH));
    const result = db.query('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    expect(result?.count).toBe(2);
  });

  test('should handle invalid cache file gracefully', async () => {
    // Write invalid JSON to cache file
    writeFileSync(TEST_CACHE_PATH, 'invalid json content');

    // Wait for file watch event to be processed
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify the database hasn't been corrupted
    const db = await import('bun:sqlite').then((sqlite) => new sqlite.Database(TEST_DB_PATH));
    const result = db.query('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    expect(result?.count).toBe(2); // Should maintain previous state
  });
});
