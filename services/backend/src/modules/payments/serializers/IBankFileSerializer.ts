export interface PayoutExportRecord {
  payoutId: string;
  itemId: string;
  farmerCode: string;
  customerName: string;
  bankAccount: string;
  bankIfsc: string;
  amount: number;
  referenceNumber: string;
  narration?: string;
}

export interface PaymentBatchExportDetail {
  batchId: string;
  batchNumber: string;
  organizationId: string;
  organizationName?: string;
  debitAccountNumber?: string;
  totalBeneficiaries: number;
  totalAmount: number;
  approvedBy?: string;
  approvedAt?: string;
  items: PayoutExportRecord[];
}

export interface SerializedBankFile {
  formatIdentifier: string;
  fileName: string;
  mimeType: string;
  content: string;
  rowCount: number;
  totalAmount: number;
  checksumSha256: string;
}

export interface IBankFileSerializer {
  readonly formatIdentifier: string;
  serialize(batch: PaymentBatchExportDetail): Promise<SerializedBankFile>;
}
