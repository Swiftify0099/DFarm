import type { IBankFileSerializer, PaymentBatchExportDetail, SerializedBankFile } from './IBankFileSerializer.js';
export declare class UnionBankBulkNeftSerializer implements IBankFileSerializer {
    readonly formatIdentifier = "UNION_BANK_BULK_NEFT_CSV";
    serialize(batch: PaymentBatchExportDetail): Promise<SerializedBankFile>;
}
export declare class UnionBankCapsSerializer implements IBankFileSerializer {
    readonly formatIdentifier = "UNION_BANK_CAPS_TXT";
    serialize(batch: PaymentBatchExportDetail): Promise<SerializedBankFile>;
}
//# sourceMappingURL=UnionBankFileSerializer.d.ts.map