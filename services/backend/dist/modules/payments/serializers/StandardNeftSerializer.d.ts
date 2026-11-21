import type { IBankFileSerializer, PaymentBatchExportDetail, SerializedBankFile } from './IBankFileSerializer.js';
export declare class StandardNeftSerializer implements IBankFileSerializer {
    readonly formatIdentifier = "NEFT_STANDARD";
    serialize(batch: PaymentBatchExportDetail): Promise<SerializedBankFile>;
}
//# sourceMappingURL=StandardNeftSerializer.d.ts.map