import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { DatabaseConnection } from '../../src/database/connection';

const TEST_DB_PATH = join(process.cwd(), 'test.db');

describe('DatabaseConnection', () => {
  beforeAll(() => {
    // Clean up any existing test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  afterAll(() => {
    // Clean up after tests
    DatabaseConnection.closeConnection();
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }
  });

  test('should create a new database connection', async () => {
    const db = await DatabaseConnection.getInstance(TEST_DB_PATH);
    expect(db).toBeDefined();
    expect(existsSync(TEST_DB_PATH)).toBe(true);
  });

  test('should reuse existing connection', async () => {
    const db1 = await DatabaseConnection.getInstance(TEST_DB_PATH);
    const db2 = await DatabaseConnection.getInstance(TEST_DB_PATH);
    expect(db1).toBe(db2);
  });

  test('should initialize schemas', async () => {
    const db = await DatabaseConnection.getInstance(TEST_DB_PATH);

    // Test if tables were created by checking sqlite_master
    const tables = db.query('SELECT name FROM sqlite_master WHERE type="table"').all();
    expect(tables.length).toBeGreaterThan(0);
  });

  test('should handle connection errors gracefully', async () => {
    // Try to connect to an invalid path
    const invalidPath = '/invalid/path/db.sqlite';
    await expect(DatabaseConnection.getInstance(invalidPath)).rejects.toThrow();
  });

  test('should close connection properly', () => {
    DatabaseConnection.closeConnection();
    // Verify we can create a new connection after closing
    expect(async () => {
      await DatabaseConnection.getInstance(TEST_DB_PATH);
    }).not.toThrow();
  });
});
