export interface StorageResult {
    storagePath: string;
    sha256Hash: string;
    isDurable: boolean;
}
export declare class DurableStatementStorage {
    private static readonly BUCKET_NAME;
    private static readonly LOCAL_STORAGE_DIR;
    /**
     * Persists a statement PDF buffer either to private Supabase Object Storage or falls back safely to local disk.
     */
    static storeStatement(billId: string, buffer: Buffer): Promise<StorageResult>;
    /**
     * Generates a short-lived signed download URL (default 15 minutes) for secure access.
     */
    static getSignedDownloadUrl(storagePath: string, expiresInSeconds?: number): Promise<string | null>;
    /**
     * Retrieves the statement buffer from storage.
     */
    static getStatementBuffer(storagePath: string): Promise<Buffer | null>;
}
//# sourceMappingURL=durable-statement-storage.d.ts.map