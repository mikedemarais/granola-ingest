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
    // Example specialized hashing if needed
    const data = JSON.stringify(doc);
    return this.getHash(data);
  }
}