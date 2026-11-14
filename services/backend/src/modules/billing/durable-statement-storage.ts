import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getAdminSupabaseClient } from '../../config/supabase.js';
import { logger } from '../../shared/logger/index.js';

export interface StorageResult {
  storagePath: string;
  sha256Hash: string;
  isDurable: boolean;
}

export class DurableStatementStorage {
  private static readonly BUCKET_NAME = 'billing_statements';
  private static readonly LOCAL_STORAGE_DIR = path.resolve(process.cwd(), 'storage', 'billing_statements');

  /**
   * Persists a statement PDF buffer either to private Supabase Object Storage or falls back safely to local disk.
   */
  public static async storeStatement(
    billId: string,
    buffer: Buffer
  ): Promise<StorageResult> {
    const sha256Hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const filename = `${billId}.pdf`;

    // 1. Always ensure local disk copy exists for immediate local reads
    if (!fs.existsSync(this.LOCAL_STORAGE_DIR)) {
      fs.mkdirSync(this.LOCAL_STORAGE_DIR, { recursive: true });
    }
    const localPath = path.join(this.LOCAL_STORAGE_DIR, filename);
    fs.writeFileSync(localPath, buffer);

    // 2. Attempt private durable object storage upload
    try {
      const supabase = getAdminSupabaseClient();
      const objectPath = `statements/${filename}`;
      const { error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .upload(objectPath, buffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (!error) {
        return {
          storagePath: `supabase://${this.BUCKET_NAME}/${objectPath}`,
          sha256Hash,
          isDurable: true,
        };
      } else {
        logger.warn({ error: error.message }, 'Supabase storage upload bypassed; falling back to local storage');
      }
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Supabase storage unavailable; falling back to local storage');
    }

    return {
      storagePath: localPath,
      sha256Hash,
      isDurable: false,
    };
  }

  /**
   * Generates a short-lived signed download URL (default 15 minutes) for secure access.
   */
  public static async getSignedDownloadUrl(
    storagePath: string,
    expiresInSeconds: number = 900
  ): Promise<string | null> {
    if (storagePath.startsWith('supabase://')) {
      try {
        const supabase = getAdminSupabaseClient();
        const objectPath = storagePath.replace(`supabase://${this.BUCKET_NAME}/`, '');
        const { data, error } = await supabase.storage
          .from(this.BUCKET_NAME)
          .createSignedUrl(objectPath, expiresInSeconds);

        if (!error && data?.signedUrl) {
          return data.signedUrl;
        }
      } catch (err: any) {
        logger.error({ error: err.message }, 'Failed to create signed URL for statement');
      }
    }
    return null;
  }

  /**
   * Retrieves the statement buffer from storage.
   */
  public static async getStatementBuffer(storagePath: string): Promise<Buffer | null> {
    if (storagePath.startsWith('supabase://')) {
      try {
        const supabase = getAdminSupabaseClient();
        const objectPath = storagePath.replace(`supabase://${this.BUCKET_NAME}/`, '');
        const { data, error } = await supabase.storage
          .from(this.BUCKET_NAME)
          .download(objectPath);

        if (!error && data) {
          const arrayBuffer = await data.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
      } catch (err: any) {
        logger.warn({ error: err.message }, 'Failed to download from Supabase storage; attempting local fallback');
      }
    }

    // Local fallback
    const localPath = storagePath.startsWith('supabase://')
      ? path.join(this.LOCAL_STORAGE_DIR, path.basename(storagePath))
      : storagePath;

    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }

    return null;
  }
}
