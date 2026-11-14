import type { CustomerStatementSummary } from '@dfarm/shared-types';
export interface PdfGenerationResult {
    buffer: Buffer;
    sha256Hash: string;
    storagePath: string;
}
export declare class PdfStatementGenerator {
    /**
     * Generates an official Customer Settlement Statement PDF.
     */
    static generate(statement: CustomerStatementSummary): Promise<PdfGenerationResult>;
}
//# sourceMappingURL=pdf-statement.generator.d.ts.map