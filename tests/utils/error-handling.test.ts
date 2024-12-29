import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { join } from 'path';
import { DatabaseConnection } from '../../src/database/connection';
import type { Document } from '../../src/models/types';
import { DocumentService } from '../../src/services/DocumentService';

const TEST_DB_PATH = join(process.cwd(), 'test-error.db');

describe('Error Handling and Recovery', () => {
  let db: Awaited<ReturnType<typeof DatabaseConnection.getInstance>>;
  let documentService: DocumentService;

  beforeAll(async () => {
    db = await DatabaseConnection.getInstance(TEST_DB_PATH);
    documentService = new DocumentService(db);
  });

  afterAll(() => {
    DatabaseConnection.closeConnection();
  });

  test('should handle database connection errors', async () => {
    // Try to connect to an invalid path
    await expect(DatabaseConnection.getInstance('/invalid/path/db.sqlite')).rejects.toThrow();
  });

  test('should handle invalid document data', async () => {
    const invalidDocument = {
      id: 'doc-123',
      // Missing required fields
    } as Document;

    await expect(documentService.upsertDocument(invalidDocument)).rejects.toThrow();
  });

  test('should handle concurrent database operations', async () => {
    const documents = Array.from(
      { length: 10 },
      (_, i) =>
        ({
          id: `doc-${i}`,
          title: `Document ${i}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          user_id: 'test-user',
          notes_markdown: '',
          notes_plain: '',
          transcribe: false,
          public: false,
          type: null,
          valid_meeting: false,
          has_shareable_link: false,
          creation_source: 'test',
          subscription_plan_id: null,
          privacy_mode_enabled: false,
        }) satisfies Document
    );

    // Perform concurrent inserts
    await expect(
      Promise.all(documents.map((doc) => documentService.upsertDocument(doc)))
    ).resolves.not.toThrow();

    // Verify all documents were inserted
    const result = db.query('SELECT COUNT(*) as count FROM documents').get() as { count: number };
    expect(result.count).toBe(10);
  });

  test('should handle database transaction rollback', async () => {
    const initialResult = db.query('SELECT COUNT(*) as count FROM documents').get() as {
      count: number;
    };
    const initialCount = initialResult.count;

    try {
      await db.transaction(() => {
        // Insert a valid document
        const validDoc: Document = {
          id: 'valid-doc',
          title: 'Valid Document',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          deleted_at: null,
          user_id: 'test-user',
          notes_markdown: '',
          notes_plain: '',
          transcribe: false,
          public: false,
          type: null,
          valid_meeting: false,
          has_shareable_link: false,
          creation_source: 'test',
          subscription_plan_id: null,
          privacy_mode_enabled: false,
        };
        documentService.upsertDocument(validDoc);

        // Insert an invalid document that should cause the transaction to fail
        const invalidDoc = {
          id: 'invalid-doc',
          // Missing required fields
        } as Document;
        documentService.upsertDocument(invalidDoc);
      })();
    } catch (error) {
      // Expected to throw
    }

    // Verify no documents were inserted due to transaction rollback
    const finalResult = db.query('SELECT COUNT(*) as count FROM documents').get() as {
      count: number;
    };
    expect(finalResult.count).toBe(initialCount);
  });

  test('should handle and log errors appropriately', async () => {
    const mockLogger = {
      error: mock(() => {}),
      info: mock(() => {}),
    };

    // Replace the actual logger with our mock
    const originalLogger = console.error;
    console.error = mockLogger.error;

    try {
      await documentService.upsertDocument({
        id: 'error-doc',
        // Invalid document
      } as Document);
    } catch (error) {
      expect(mockLogger.error).toHaveBeenCalled();
    } finally {
      // Restore the original logger
      console.error = originalLogger;
    }
  });
});
