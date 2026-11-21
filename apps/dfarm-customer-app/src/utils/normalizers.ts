import { MilkCollectionRecord } from '../types/collection';
import { CustomerLedgerEntry } from '../types/ledger';
import { BillStatement } from '../types/bills';

export function normalizeMilkCollectionRecord(raw: any): MilkCollectionRecord {
  if (!raw) return raw;

  const rawQty = raw.quantityLiters ?? raw.weightLiters ?? raw.netWeight ?? raw.liters ?? 0;
  const rawRate = raw.ratePerLiter ?? raw.appliedRatePerLiter ?? raw.rate ?? 0;
  const rawTotal = raw.totalAmount ?? raw.amount ?? Number(rawQty) * Number(rawRate);
  const rawAnimal = String(raw.animalType || raw.milkCategory || 'COW').toUpperCase();
  const animalType: 'COW' | 'BUFFALO' = rawAnimal === 'BUFFALO' ? 'BUFFALO' : 'COW';
  const rawShift = String(raw.shift || raw.shiftType || 'MORNING').toUpperCase();
  const shift: 'MORNING' | 'EVENING' = rawShift === 'EVENING' ? 'EVENING' : 'MORNING';

  const rawDate =
    raw.collectionDate ||
    raw.date ||
    (raw.timestamp ? String(raw.timestamp).split('T')[0] : '') ||
    new Date().toISOString().split('T')[0];
  let rawTime = raw.collectionTime || '';
  if (!rawTime && raw.timestamp && String(raw.timestamp).includes('T')) {
    rawTime = String(raw.timestamp).split('T')[1].substring(0, 5);
  }

  return {
    id: String(raw.id || ''),
    receiptNumber: String(
      raw.receiptNumber ||
        raw.transactionCode ||
        raw.transactionId ||
        (raw.id ? `REC-${String(raw.id).substring(0, 8).toUpperCase()}` : 'REC-PENDING')
    ),
    shift,
    collectionDate: String(rawDate),
    collectionTime: String(rawTime || (shift === 'MORNING' ? '07:00' : '18:00')),
    animalType,
    quantityLiters: Number(rawQty) || 0,
    fatPercentage: Number(raw.fatPercentage ?? raw.fat ?? 0) || 0,
    snfPercentage: Number(raw.snfPercentage ?? raw.snf ?? 0) || 0,
    lactometerReading:
      raw.lactometerReading != null || raw.clrDensity != null
        ? Number(raw.lactometerReading ?? raw.clrDensity)
        : undefined,
    ratePerLiter: Number(rawRate) || 0,
    totalAmount: Number(rawTotal) || 0,
    operatorName: String(raw.operatorName || 'Collection Center'),
    operatorId: String(raw.operatorId || raw.deviceId || 'OP-01'),
    verifiedBiometrically: Boolean(
      raw.verifiedBiometrically ?? (raw.identificationMethod === 'FACE_YUNET_SFACE')
    ),
  };
}

export function normalizeLedgerEntry(raw: any): CustomerLedgerEntry {
  if (!raw) return raw;
  const isCredit =
    raw.type === 'MILK_CREDIT' ||
    raw.direction === 'CREDIT' ||
    raw.transactionType === 'MILK_COLLECTION' ||
    Number(raw.creditAmount) > 0;
  const amount = Math.abs(Number(raw.amount ?? 0));
  const creditAmount = Number(raw.creditAmount ?? (isCredit ? amount : 0));
  const debitAmount = Number(raw.debitAmount ?? (!isCredit ? amount : 0));
  const runningBalance = Number(raw.runningBalance ?? raw.balanceAfter ?? 0);

  let type: CustomerLedgerEntry['type'] = 'ADJUSTMENT';
  if (
    raw.type &&
    ['MILK_CREDIT', 'FEED_DEBIT', 'CASH_ADVANCE_DEBIT', 'BANK_PAYOUT', 'ADJUSTMENT'].includes(
      raw.type
    )
  ) {
    type = raw.type;
  } else if (raw.transactionType === 'MILK_COLLECTION' || isCredit) {
    type = 'MILK_CREDIT';
  } else if (raw.transactionType === 'FEED_PURCHASE') {
    type = 'FEED_DEBIT';
  } else if (raw.transactionType === 'PAYOUT' || raw.transactionType === 'BANK_TRANSFER') {
    type = 'BANK_PAYOUT';
  }

  return {
    id: String(raw.id || ''),
    transactionDate: String(raw.transactionDate || raw.createdAt || new Date().toISOString()),
    type,
    description: String(
      raw.description || (isCredit ? 'Milk Collection Credit' : 'Deduction / Payment')
    ),
    creditAmount,
    debitAmount,
    runningBalance,
    referenceId: raw.referenceId ? String(raw.referenceId) : undefined,
  };
}

export function normalizeBillStatement(raw: any): BillStatement {
  if (!raw) return raw;

  const grossMilkAmount = Number(
    raw.grossMilkAmount ?? raw.grossAmount ?? raw.gross_milk_amount ?? 0
  );
  const feedDeductions = Number(
    raw.feedDeductions ?? raw.deductionsAmount ?? raw.feed_purchases_debit ?? 0
  );
  const otherDeductions = Number(raw.otherDeductions ?? 0);
  const netPayableAmount = Number(
    raw.netPayableAmount ??
      raw.net_payable_amount ??
      grossMilkAmount - feedDeductions - otherDeductions
  );
  const totalLiters = Number(raw.totalLiters ?? raw.total_milk_weight ?? 0);

  let status: BillStatement['status'] = 'PENDING';
  const rawStatus = String(raw.status || raw.bill_status || 'PENDING').toUpperCase();
  if (['PENDING', 'APPROVED', 'DISBURSED', 'CANCELLED'].includes(rawStatus)) {
    status = rawStatus as BillStatement['status'];
  } else if (rawStatus === 'PAID') {
    status = 'DISBURSED';
  }

  const cycleStartDate = String(
    raw.cycleStartDate ||
      raw.periodStart ||
      raw.billing_period_start ||
      new Date().toISOString().split('T')[0]
  );
  const cycleEndDate = String(
    raw.cycleEndDate ||
      raw.periodEnd ||
      raw.billing_period_end ||
      new Date().toISOString().split('T')[0]
  );

  return {
    billId: String(raw.billId || raw.id || ''),
    billNumber: String(
      raw.billNumber || raw.bill_number || `DFB-${String(raw.id || '').substring(0, 8)}`
    ),
    cycleStartDate,
    cycleEndDate,
    cycleLabel: String(raw.cycleLabel || `Cycle (${cycleStartDate} - ${cycleEndDate})`),
    totalLiters,
    grossMilkAmount,
    feedDeductions,
    otherDeductions,
    netPayableAmount,
    status,
    disbursedDate:
      raw.disbursedDate ||
      (raw.paidAt
        ? new Date(raw.paidAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : undefined),
    paymentMode: raw.paymentMode || 'Direct Bank Transfer',
    utrNumber: raw.utrNumber,
    pdfUrl: raw.pdfUrl,
  };
}
