import type { FormattedPaymentReceipt } from '@dfarm/shared-types';

export interface ReceiptData {
  organizationName: string;
  centerName: string;
  customerName: string;
  farmerCode: string;
  paymentId: string;
  receiptNumber: string;
  direction: 'DAIRY_PAYS_CUSTOMER' | 'CUSTOMER_PAYS_DAIRY';
  amount: number;
  currency: string;
  paymentMethod: string;
  referenceNumber?: string | null;
  status: string;
  timestamp: string | Date;
  authorizedActor: string;
  bankAccountMask?: string | null;
  previousBalance?: number | null;
  balanceAfter?: number | null;
  notes?: string | null;
}

export function formatPaymentReceipt(data: ReceiptData): FormattedPaymentReceipt {
  const isSettled = data.status === 'SETTLED';
  const displayStatus = isSettled ? 'SETTLED' : 'PENDING';
  const dateStr = new Date(data.timestamp).toISOString().replace('T', ' ').substring(0, 19);

  const isPayout = data.direction === 'DAIRY_PAYS_CUSTOMER';
  const receiptTitle = isPayout ? 'DFARM FARMER PAYOUT VOUCHER' : 'DFARM CUSTOMER RECEIPT VOUCHER';
  const directionLabel = isPayout ? 'Dairy Pays Farmer (Payout)' : 'Farmer Pays Dairy (Repayment)';

  // Build 40-column monospace thermal receipt
  const center = (text: string, width = 40) => {
    const leftPad = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(leftPad) + text;
  };
  const row = (label: string, value: string) => {
    const space = Math.max(1, 40 - label.length - value.length);
    return label + ' '.repeat(space) + value;
  };

  const lines: string[] = [];
  lines.push('='.repeat(40));
  lines.push(center(data.organizationName));
  lines.push(center(data.centerName));
  lines.push(center(receiptTitle));
  lines.push('='.repeat(40));
  lines.push(row('Receipt No:', data.receiptNumber));
  lines.push(row('Date / Time:', dateStr));
  lines.push(row('Payment ID:', data.paymentId.substring(0, 12) + '...'));
  lines.push('-'.repeat(40));
  lines.push(row('Farmer Code:', data.farmerCode));
  lines.push(row('Farmer Name:', data.customerName));
  lines.push(row('Direction:', isPayout ? 'DAIRY -> FARMER' : 'FARMER -> DAIRY'));
  lines.push(row('Method:', data.paymentMethod));
  if (data.referenceNumber) {
    lines.push(row('Ref No:', data.referenceNumber));
  }
  if (data.bankAccountMask) {
    lines.push(row('Bank Acc:', data.bankAccountMask));
  }
  lines.push('-'.repeat(40));
  lines.push(row('PAYMENT AMOUNT:', `${data.currency} ${Number(data.amount).toFixed(2)}`));
  if (data.balanceAfter !== null && data.balanceAfter !== undefined) {
    lines.push(row('Customer Balance:', `${data.currency} ${Number(data.balanceAfter).toFixed(2)}`));
  }
  lines.push('='.repeat(40));
  lines.push(center(`*** PAYMENT STATUS: ${displayStatus} ***`));
  if (!isSettled) {
    lines.push(center('[ FUNDS PENDING BANK SETTLEMENT ]'));
  }
  lines.push(row('Authorized Actor:', data.authorizedActor));
  lines.push('='.repeat(40));
  lines.push(center('Thank you for partnering with DFarm'));
  lines.push(center('Server-Authoritative Digital Slip'));

  return {
    receiptTitle,
    receiptNumber: data.receiptNumber,
    organizationName: data.organizationName,
    centerName: data.centerName,
    customerName: data.customerName,
    farmerCode: data.farmerCode,
    paymentId: data.paymentId,
    direction: data.direction as any,
    directionLabel,
    amount: Number(data.amount),
    currency: data.currency,
    paymentMethod: data.paymentMethod as any,
    referenceNumber: data.referenceNumber || 'N/A',
    status: data.status as any,
    timestamp: dateStr,
    authorizedActor: data.authorizedActor,
    bankAccountMask: data.bankAccountMask,
    slip40ColumnText: lines.join('\n'),
  };
}
