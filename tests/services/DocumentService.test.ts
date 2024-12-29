import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { DatabaseConnection } from '../../src/database/connection';
import type { Document } from '../../src/models/types';
import { DocumentService } from '../../src/services/DocumentService';

const TEST_DB_PATH = join(process.cwd(), 'test-docs.db');

describe('DocumentService', () => {
  let db: Awaited<ReturnType<typeof DatabaseConnection.getInstance>>;
  let documentService: DocumentService;

  beforeAll(async () => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
    db = await DatabaseConnection.getInstance(TEST_DB_PATH);
    documentService = new DocumentService(db);
  });

  afterAll(() => {
    DatabaseConnection.closeConnection();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  beforeEach(async () => {
    // Clear documents table before each test
    db.run('DELETE FROM documents');
  });

  test('should create a new document', async () => {
    const doc: Document = {
      id: 'test-doc-1',
      title: 'Test Document',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      user_id: 'user-1',
      notes_markdown: '# Test Notes',
      notes_plain: 'Test Notes',
      transcribe: true,
      public: false,
      type: 'meeting',
      valid_meeting: false,
      has_shareable_link: false,
      creation_source: 'test',
      subscription_plan_id: null,
      privacy_mode_enabled: false,
      google_calendar_event: undefined,
    };

    await documentService.upsertDocument(doc);

    const result = db.query('SELECT * FROM documents WHERE id = ?').get(doc.id) as any;
    expect(result).toBeDefined();
    expect(result.id).toBe(doc.id);
    expect(result.title).toBe(doc.title);
  });

  test('should update an existing document', async () => {
    const doc: Document = {
      id: 'test-doc-2',
      title: 'Original Title',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      user_id: 'user-1',
      notes_markdown: '# Test Notes',
      notes_plain: 'Test Notes',
      transcribe: true,
      public: false,
      type: 'meeting',
      valid_meeting: false,
      has_shareable_link: false,
      creation_source: 'test',
      subscription_plan_id: null,
      privacy_mode_enabled: false,
      google_calendar_event: undefined,
    };

    await documentService.upsertDocument(doc);

    const updatedDoc = {
      ...doc,
      title: 'Updated Title',
      updated_at: new Date().toISOString(),
    };

    await documentService.upsertDocument(updatedDoc);

    const result = db.query('SELECT * FROM documents WHERE id = ?').get(doc.id) as any;
    expect(result.title).toBe('Updated Title');
  });

  test('should retrieve a document by id', async () => {
    const doc: Document = {
      id: 'test-doc-3',
      title: 'Test Document',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      user_id: 'user-1',
      notes_markdown: '# Test Notes',
      notes_plain: 'Test Notes',
      transcribe: true,
      public: false,
      type: 'meeting',
      valid_meeting: false,
      has_shareable_link: false,
      creation_source: 'test',
      subscription_plan_id: null,
      privacy_mode_enabled: false,
      google_calendar_event: undefined,
    };

    await documentService.upsertDocument(doc);

    const result = db.query('SELECT * FROM documents WHERE id = ?').get(doc.id) as Document;
    expect(result).toBeDefined();
    expect(result.id).toBe(doc.id);
    expect(result.title).toBe(doc.title);
  });

  test('should handle non-existent document retrieval', async () => {
    const result = db
      .query('SELECT * FROM documents WHERE id = ?')
      .get('non-existent-id') as Document | null;
    expect(result).toBeNull();
  });

  test('should delete a document', async () => {
    const doc: Document = {
      id: 'test-doc-4',
      title: 'Test Document',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      user_id: 'user-1',
      notes_markdown: '# Test Notes',
      notes_plain: 'Test Notes',
      transcribe: true,
      public: false,
      type: 'meeting',
      valid_meeting: false,
      has_shareable_link: false,
      creation_source: 'test',
      subscription_plan_id: null,
      privacy_mode_enabled: false,
      google_calendar_event: undefined,
    };

    await documentService.upsertDocument(doc);
    await db.run('DELETE FROM documents WHERE id = ?', [doc.id]);

    const result = db.query('SELECT * FROM documents WHERE id = ?').get(doc.id) as Document | null;
    expect(result).toBeNull();
  });
});
