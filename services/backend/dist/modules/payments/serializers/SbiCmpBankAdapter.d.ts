import type { IBankFileSerializer, PaymentBatchExportDetail, SerializedBankFile } from './IBankFileSerializer.js';
export declare class SbiCmpBankAdapter implements IBankFileSerializer {
    readonly formatIdentifier = "SBI_CMP";
    serialize(_batch: PaymentBatchExportDetail): Promise<SerializedBankFile>;
}
//# sourceMappingURL=SbiCmpBankAdapter.d.ts.map