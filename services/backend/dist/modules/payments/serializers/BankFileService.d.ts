import type { AuthContext } from '../../../middleware/authenticate.js';
import type { SerializedBankFile } from './IBankFileSerializer.js';
export declare class BankFileService {
    private static serializers;
    private static exportCache;
    static exportBatch(batchId: string, format: string, auth: AuthContext, options?: {
        debitAccountNumber?: string;
        targetOrganizationId?: string;
    }): Promise<{
        batchId: string;
        batchNumber: string;
        format: string;
        fileName: string;
        rowCount: number;
        totalAmount: number;
        checksumSha256: string;
        downloadToken: string;
        expiresInSeconds: number;
    }>;
    static getExportByToken(token: string): SerializedBankFile;
}
//# sourceMappingURL=BankFileService.d.ts.map