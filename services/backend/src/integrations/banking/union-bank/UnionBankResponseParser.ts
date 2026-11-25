// ==============================================================================
// DFARM - SMART DAIRY MANAGEMENT SYSTEM
// UNION BANK OF INDIA INTEGRATION: RESPONSE PARSER (PROMPT 7)
// ==============================================================================

import { BadRequestError } from '../../../shared/errors/app-error.js';
import type {
  UnionBankReconciliationItemResult,
  UnionBankReconciliationSummary,
} from './types.js';

export class UnionBankResponseParser {
  /**
   * Parses Union Bank settlement reports / Reverse MIS files (CSV, Pipe-Delimited, or JSON).
   */
  public static parseResponse(
    fileContent: string,
    submissionReference?: string
  ): UnionBankReconciliationSummary {
    if (!fileContent || !fileContent.trim()) {
      throw new BadRequestError('Empty bank response payload provided for parsing', 'EMPTY_BANK_RESPONSE');
    }

    const trimmed = fileContent.trim();

    // Check if JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return this.parseJsonResponse(trimmed, submissionReference);
    }

    // Check delimiter
    const firstLine = trimmed.split('\n')[0] || '';
    if (firstLine.includes('|')) {
      return this.parseDelimited(trimmed, '|', submissionReference);
    }

    return this.parseDelimited(trimmed, ',', submissionReference);
  }

  /**
   * Parses CSV or Pipe-delimited Union Bank Reverse MIS report.
   * Expected columns (any standard ordering recognized via header heuristics):
   * Customer Reference, Bank UTR, Amount, Status, Reason/Description, Date
   */
  private static parseDelimited(
    content: string,
    delimiter: string,
    submissionReference?: string
  ): UnionBankReconciliationSummary {
    const rawLines = content
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (rawLines.length === 0) {
      throw new BadRequestError('No valid data lines found in bank response', 'INVALID_RESPONSE_FORMAT');
    }

    const firstRowTokens = this.splitLine(rawLines[0] || '', delimiter).map(t => t.toLowerCase().replace(/[^a-z0-9]/g, ''));

    // Check if first line is a header
    const hasHeader =
      firstRowTokens.some(t => t.includes('ref') || t.includes('utr') || t.includes('status') || t.includes('amount'));

    let refIdx = 0;
    let utrIdx = 1;
    let amountIdx = 2;
    let statusIdx = 3;
    let reasonIdx = 4;
    let dateIdx = 5;

    let dataLines = rawLines;

    if (hasHeader) {
      dataLines = rawLines.slice(1);
      refIdx = firstRowTokens.findIndex(t => t.includes('custref') || t.includes('ref') || t.includes('clientref') || t.includes('txnid'));
      utrIdx = firstRowTokens.findIndex(t => t.includes('utr') || t.includes('bankref') || t.includes('rrn'));
      amountIdx = firstRowTokens.findIndex(t => t.includes('amt') || t.includes('amount'));
      statusIdx = firstRowTokens.findIndex(t => t.includes('stat') || t.includes('status') || t.includes('rescode'));
      reasonIdx = firstRowTokens.findIndex(t => t.includes('reason') || t.includes('remark') || t.includes('desc') || t.includes('error'));
      dateIdx = firstRowTokens.findIndex(t => t.includes('date') || t.includes('valuedate'));

      // Fallback defaults if not detected
      if (refIdx === -1) refIdx = 0;
      if (utrIdx === -1) utrIdx = 1;
      if (amountIdx === -1) amountIdx = 2;
      if (statusIdx === -1) statusIdx = 3;
    }

    const items: UnionBankReconciliationItemResult[] = [];
    let paidCount = 0;
    let paidAmount = 0;
    let failedCount = 0;
    let failedAmount = 0;
    let reversedCount = 0;
    let unknownCount = 0;

    for (const line of dataLines) {
      const tokens = this.splitLine(line, delimiter);
      if (tokens.length < 2) continue;

      const rawRef = tokens[refIdx] || '';
      const rawUtr = utrIdx >= 0 ? tokens[utrIdx] : '';
      const rawAmt = amountIdx >= 0 ? parseFloat(tokens[amountIdx] || '0') : 0;
      const rawStatus = statusIdx >= 0 ? (tokens[statusIdx] || '').toUpperCase() : '';
      const rawReason = reasonIdx >= 0 ? tokens[reasonIdx] : undefined;
      const rawDate = dateIdx >= 0 ? tokens[dateIdx] : undefined;

      const normalizedStatus = this.normalizeBankStatus(rawStatus, rawReason);
      const cleanAmount = isNaN(rawAmt) ? 0.00 : Math.round((rawAmt + Number.EPSILON) * 100) / 100;

      if (normalizedStatus === 'PAID') {
        paidCount++;
        paidAmount += cleanAmount;
      } else if (normalizedStatus === 'FAILED') {
        failedCount++;
        failedAmount += cleanAmount;
      } else if (normalizedStatus === 'REVERSED') {
        reversedCount++;
      } else {
        unknownCount++;
      }

      items.push({
        customerReference: rawRef,
        bankUtr: rawUtr || undefined,
        bankReference: rawUtr || undefined,
        amount: cleanAmount,
        status: normalizedStatus,
        failureReason: rawReason,
        transactionDate: rawDate,
        rawRecord: { line },
      });
    }

    return {
      submissionReference,
      totalProcessed: items.length,
      paidCount,
      paidAmount: Math.round((paidAmount + Number.EPSILON) * 100) / 100,
      failedCount,
      failedAmount: Math.round((failedAmount + Number.EPSILON) * 100) / 100,
      reversedCount,
      unknownCount,
      items,
    };
  }

  /**
   * Parses JSON responses from Union Bank Web Services or API callbacks.
   */
  private static parseJsonResponse(
    jsonString: string,
    submissionReference?: string
  ): UnionBankReconciliationSummary {
    try {
      const parsed = JSON.parse(jsonString);
      const rawItems = Array.isArray(parsed) ? parsed : (parsed.transactions || parsed.items || parsed.records || [parsed]);

      const items: UnionBankReconciliationItemResult[] = [];
      let paidCount = 0;
      let paidAmount = 0;
      let failedCount = 0;
      let failedAmount = 0;
      let reversedCount = 0;
      let unknownCount = 0;

      for (const raw of rawItems) {
        const ref = raw.customerReference || raw.clientReference || raw.paymentRef || raw.referenceNumber || raw.id;
        const utr = raw.bankUtr || raw.utr || raw.bankReference || raw.rrn;
        const amt = parseFloat(raw.amount || '0');
        const cleanAmount = isNaN(amt) ? 0.00 : Math.round((amt + Number.EPSILON) * 100) / 100;
        const status = this.normalizeBankStatus(raw.status || raw.statusCode, raw.failureReason || raw.reason);

        if (status === 'PAID') {
          paidCount++;
          paidAmount += cleanAmount;
        } else if (status === 'FAILED') {
          failedCount++;
          failedAmount += cleanAmount;
        } else if (status === 'REVERSED') {
          reversedCount++;
        } else {
          unknownCount++;
        }

        items.push({
          customerReference: String(ref),
          bankUtr: utr ? String(utr) : undefined,
          bankReference: utr ? String(utr) : undefined,
          amount: cleanAmount,
          status,
          failureReason: raw.failureReason || raw.reason || raw.statusDesc,
          transactionDate: raw.transactionDate || raw.date,
          rawRecord: raw,
        });
      }

      return {
        submissionReference,
        totalProcessed: items.length,
        paidCount,
        paidAmount: Math.round((paidAmount + Number.EPSILON) * 100) / 100,
        failedCount,
        failedAmount: Math.round((failedAmount + Number.EPSILON) * 100) / 100,
        reversedCount,
        unknownCount,
        items,
      };
    } catch (err: any) {
      throw new BadRequestError(`Invalid Union Bank JSON response: ${err.message}`, 'MALFORMED_BANK_JSON');
    }
  }

  /**
   * Normalizes bank-specific status codes into DFarm standard settlement statuses.
   */
  public static normalizeBankStatus(
    statusStr?: string,
    reason?: string
  ): 'PAID' | 'FAILED' | 'REVERSED' | 'PENDING' | 'UNKNOWN' {
    if (!statusStr) return 'UNKNOWN';
    const s = statusStr.toUpperCase().trim();

    if (
      s === 'SUCCESS' ||
      s === 'PAID' ||
      s === 'SETTLED' ||
      s === 'CLEARED' ||
      s === 'PROCESSED' ||
      s === '00' ||
      s === '000'
    ) {
      return 'PAID';
    }

    if (s === 'REVERSED' || s === 'RETURNED' || s === 'BOUNCED' || s === 'CLAWBACK') {
      return 'REVERSED';
    }

    if (
      s === 'FAILED' ||
      s === 'REJECTED' ||
      s === 'DECLINED' ||
      s === 'ERROR' ||
      s === 'INVALID_ACCOUNT' ||
      s === 'INVALID_IFSC' ||
      (reason && reason.toLowerCase().includes('reject'))
    ) {
      return 'FAILED';
    }

    if (s === 'PENDING' || s === 'PROCESSING' || s === 'SUBMITTED' || s === 'IN_PROGRESS' || s === 'QUEUED') {
      return 'PENDING';
    }

    return 'UNKNOWN';
  }

  private static splitLine(line: string, delimiter: string): string[] {
    if (delimiter === ',') {
      // Handles quotes correctly for CSV
      const regex = /(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g;
      const elements: string[] = [];
      let match;
      while ((match = regex.exec(line))) {
        let val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2];
        elements.push((val || '').trim());
      }
      return elements;
    }
    return line.split(delimiter).map(t => t.trim());
  }
}
