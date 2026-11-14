export function formatPaymentReceipt(data) {
    const isSettled = data.status === 'SETTLED';
    const displayStatus = isSettled ? 'SETTLED' : 'PENDING';
    const dateStr = new Date(data.timestamp).toISOString().replace('T', ' ').substring(0, 19);
    const isPayout = data.direction === 'DAIRY_PAYS_CUSTOMER';
    const receiptTitle = isPayout ? 'DFARM FARMER PAYOUT VOUCHER' : 'DFARM CUSTOMER RECEIPT VOUCHER';
    const directionLabel = isPayout ? 'Dairy Pays Farmer (Payout)' : 'Farmer Pays Dairy (Repayment)';
    // Build 40-column monospace thermal receipt
    const center = (text, width = 40) => {
        const leftPad = Math.max(0, Math.floor((width - text.length) / 2));
        return ' '.repeat(leftPad) + text;
    };
    const row = (label, value) => {
        const space = Math.max(1, 40 - label.length - value.length);
        return label + ' '.repeat(space) + value;
    };
    const lines = [];
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
        direction: data.direction,
        directionLabel,
        amount: Number(data.amount),
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        referenceNumber: data.referenceNumber || 'N/A',
        status: data.status,
        timestamp: dateStr,
        authorizedActor: data.authorizedActor,
        bankAccountMask: data.bankAccountMask,
        slip40ColumnText: lines.join('\n'),
    };
}
//# sourceMappingURL=payment-receipt-formatter.js.map