import { createHash } from 'crypto';
import loadXXHash64 from 'xxhash-wasm';

export class HashUtil {
  private static xxhash: ((input: string) => bigint) | null = null;
  private static initPromise: Promise<void> | null = null;

  private static async initialize() {
    if (!this.initPromise) {
      this.initPromise = loadXXHash64().then(hash => {
        this.xxhash = hash.h64;
      });
    }
    return this.initPromise;
  }

  static async getHash(data: string): Promise<string> {
    await this.initialize();
    if (!this.xxhash) {
      return createHash('sha256').update(data).digest('hex');
    }
    return this.xxhash(data).toString(16);
  }

  static async getDocumentHash(doc: any): Promise<string> {
    const hashInput = [
      doc.title || '',
      doc.notes_markdown || '',
      doc.notes_plain || '',
      doc.updated_at || '',
      doc.deleted_at || '',
      doc.public ? '1' : '0',
      doc.valid_meeting ? '1' : '0',
      doc.has_shareable_link ? '1' : '0',
      doc.privacy_mode_enabled ? '1' : '0'
    ].join('|');

    return this.getHash(hashInput);
  }
}