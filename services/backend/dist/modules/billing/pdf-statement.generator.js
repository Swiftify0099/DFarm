import PDFDocument from 'pdfkit';
import { DurableStatementStorage } from './durable-statement-storage.js';
export class PdfStatementGenerator {
    /**
     * Generates an official Customer Settlement Statement PDF.
     */
    static async generate(statement) {
        const { bill, customer, period, dairy, milkBreakdown, items, adjustments: _adjustments } = statement;
        return new Promise((resolve, reject) => {
            try {
                const doc = new PDFDocument({
                    size: 'A4',
                    margin: 36, // 0.5 inch margins
                    info: {
                        Title: `Milk Settlement Statement - ${bill.billNumber}`,
                        Author: dairy.organizationName,
                        Subject: `Monthly Bill for ${customer.fullName} (${customer.farmerCode})`,
                        Keywords: 'dairy, milk, settlement, billing, statement, dfarm',
                        CreationDate: new Date(),
                    },
                });
                const chunks = [];
                doc.on('data', (chunk) => chunks.push(chunk));
                doc.on('error', (err) => reject(err));
                doc.on('end', async () => {
                    try {
                        const buffer = Buffer.concat(chunks);
                        const storageResult = await DurableStatementStorage.storeStatement(bill.id, buffer);
                        resolve({
                            buffer,
                            sha256Hash: storageResult.sha256Hash,
                            storagePath: storageResult.storagePath,
                        });
                    }
                    catch (err) {
                        reject(err);
                    }
                });
                // ----------------------------------------------------
                // HEADER SECTION
                // ----------------------------------------------------
                doc.rect(36, 36, 523, 70).fill('#134e4a'); // Deep Teal Header
                doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold');
                doc.text(dairy.organizationName.toUpperCase(), 48, 48);
                doc.fontSize(10).font('Helvetica');
                doc.text(`Center: ${dairy.centerName} (${dairy.centerCode})`, 48, 68);
                doc.text(`DFarm Smart Dairy Settlement Engine | Phase 13 Compliance`, 48, 82);
                doc.fontSize(12).font('Helvetica-Bold').fillColor('#facc15'); // Gold badge
                doc.text('MONTHLY SETTLEMENT STATEMENT', 320, 52, { align: 'right', width: 220 });
                doc.fontSize(9).font('Helvetica').fillColor('#FFFFFF');
                doc.text(`Bill Ref: ${bill.billNumber}`, 320, 70, { align: 'right', width: 220 });
                doc.text(`Status: ${bill.billStatus} (v${bill.version})`, 320, 84, { align: 'right', width: 220 });
                doc.moveDown(2);
                // ----------------------------------------------------
                // CUSTOMER & PERIOD INFO BOX
                // ----------------------------------------------------
                const boxTop = 115;
                doc.rect(36, boxTop, 523, 85).fillAndStroke('#f8fafc', '#cbd5e1');
                doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold');
                doc.text('FARMER / PRODUCER DETAILS', 48, boxTop + 10);
                doc.text('BILLING PERIOD DETAILS', 310, boxTop + 10);
                doc.font('Helvetica').fontSize(9).fillColor('#334155');
                doc.text(`Name: ${customer.fullName}`, 48, boxTop + 26);
                doc.text(`Farmer Code: ${customer.farmerCode}`, 48, boxTop + 39);
                doc.text(`Mobile: ${customer.maskedMobileNumber}`, 48, boxTop + 52);
                doc.text(`Customer UUID: ${customer.id}`, 48, boxTop + 65);
                doc.text(`Period Name: ${period.periodName}`, 310, boxTop + 26);
                doc.text(`Date Range: ${period.startDate} to ${period.endDate}`, 310, boxTop + 39);
                doc.text(`Cycle Type: ${period.cycleType}`, 310, boxTop + 52);
                doc.text(`Bank A/C: ${customer.bankAccountNumber ? `****${customer.bankAccountNumber.slice(-4)} (${customer.bankIfscCode || 'IFSC'})` : 'Cash / In-Person'}`, 310, boxTop + 65);
                // ----------------------------------------------------
                // FINANCIAL SETTLEMENT SUMMARY TABLE
                // ----------------------------------------------------
                const tableTop = 210;
                doc.rect(36, tableTop, 523, 20).fill('#0f172a');
                doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
                doc.text('ACCOUNT SUMMARY ITEM', 48, tableTop + 5);
                doc.text('CREDIT (₹)', 340, tableTop + 5, { width: 90, align: 'right' });
                doc.text('DEBIT (₹)', 445, tableTop + 5, { width: 100, align: 'right' });
                let currentY = tableTop + 22;
                const addSummaryRow = (label, credit, debit, isBold = false) => {
                    doc.rect(36, currentY, 523, 16).fill(currentY % 32 === 0 ? '#f1f5f9' : '#ffffff');
                    doc.fillColor(isBold ? '#0f172a' : '#334155').font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5);
                    doc.text(label, 48, currentY + 3);
                    if (credit !== null && credit > 0) {
                        doc.text(credit.toFixed(2), 340, currentY + 3, { width: 90, align: 'right' });
                    }
                    else if (credit === 0) {
                        doc.text('0.00', 340, currentY + 3, { width: 90, align: 'right' });
                    }
                    if (debit !== null && debit > 0) {
                        doc.text(debit.toFixed(2), 445, currentY + 3, { width: 100, align: 'right' });
                    }
                    else if (debit === 0) {
                        doc.text('0.00', 445, currentY + 3, { width: 100, align: 'right' });
                    }
                    currentY += 16;
                };
                // Opening Balance
                const opBal = Number(bill.openingBalance);
                if (opBal >= 0) {
                    addSummaryRow('1. Previous Opening Balance (Owed by Dairy)', opBal, null);
                }
                else {
                    addSummaryRow('1. Previous Opening Balance (Owed by Farmer)', null, Math.abs(opBal));
                }
                // Milk Credits
                addSummaryRow(`2. Cow Milk Total (${milkBreakdown.cow.totalQuantityKg.toFixed(2)} KG across ${milkBreakdown.cow.collectionsCount} collections)`, Number(bill.totalCowMilkAmount), null);
                addSummaryRow(`3. Buffalo Milk Total (${milkBreakdown.buffalo.totalQuantityKg.toFixed(2)} KG across ${milkBreakdown.buffalo.collectionsCount} collections)`, Number(bill.totalBuffaloMilkAmount), null);
                if (Number(bill.otherCreditsAmount) > 0) {
                    addSummaryRow('4. Other Credits & Authorized Incentives', Number(bill.otherCreditsAmount), null);
                }
                // Deductions & Debits
                addSummaryRow('5. Cattle Feed Purchases & Store Debits', null, Number(bill.feedPurchasesDebit));
                addSummaryRow('6. Farmer Emergency Advances Recovered', null, Number(bill.advancesDebit));
                addSummaryRow('7. Veterinary & Cooperative Deductions', null, Number(bill.deductionsDebit));
                if (Number(bill.otherDebitsAmount) > 0) {
                    addSummaryRow('8. Other Authorized Debit Adjustments', null, Number(bill.otherDebitsAmount));
                }
                addSummaryRow('9. Settled Payouts Paid during Period', null, Number(bill.settledPayoutsAmount));
                // Subtotals
                addSummaryRow('TOTAL CREDITS & DEBITS', Number(bill.totalCredits), Number(bill.totalDebits) + Number(bill.settledPayoutsAmount), true);
                // Net Closing Balance Highlight Box
                currentY += 5;
                const isNeg = bill.isNegativeBalance;
                const highlightColor = isNeg ? '#fef2f2' : '#f0fdf4';
                const strokeColor = isNeg ? '#ef4444' : '#16a34a';
                doc.rect(36, currentY, 523, 34).fillAndStroke(highlightColor, strokeColor);
                doc.fillColor(isNeg ? '#991b1b' : '#166534').font('Helvetica-Bold').fontSize(11);
                if (!isNeg) {
                    doc.text(`CLOSING BALANCE (PAYABLE TO FARMER): ₹${Number(bill.closingBalance).toFixed(2)}`, 48, currentY + 10);
                    doc.fontSize(9).font('Helvetica');
                    doc.text(`Net Amount Payable: ₹${Number(bill.netPayableAmount).toFixed(2)}`, 48, currentY + 22);
                }
                else {
                    doc.text(`CLOSING BALANCE (RECEIVABLE FROM FARMER): -₹${Math.abs(Number(bill.closingBalance)).toFixed(2)}`, 48, currentY + 10);
                    doc.fontSize(9).font('Helvetica');
                    doc.text(`Farmer Net Debit Balance (Due to Dairy): ₹${Math.abs(Number(bill.closingBalance)).toFixed(2)} | No Payout Due`, 48, currentY + 22);
                }
                currentY += 45;
                // ----------------------------------------------------
                // MILK COLLECTIONS BREAKDOWN (TABLE)
                // ----------------------------------------------------
                doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10);
                doc.text('MILK COLLECTION LINE-ITEM SUMMARY', 48, currentY);
                currentY += 15;
                doc.rect(36, currentY, 523, 16).fill('#1e293b');
                doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
                doc.text('DATE', 42, currentY + 4, { width: 60 });
                doc.text('SHIFT', 105, currentY + 4, { width: 45 });
                doc.text('CATEGORY', 155, currentY + 4, { width: 55 });
                doc.text('QTY (KG)', 215, currentY + 4, { width: 55, align: 'right' });
                doc.text('FAT %', 275, currentY + 4, { width: 45, align: 'right' });
                doc.text('SNF %', 325, currentY + 4, { width: 45, align: 'right' });
                doc.text('RATE (₹/KG)', 375, currentY + 4, { width: 65, align: 'right' });
                doc.text('AMOUNT (₹)', 450, currentY + 4, { width: 95, align: 'right' });
                currentY += 16;
                const milkItems = items.filter(it => it.itemType === 'MILK_COLLECTION').slice(0, 20); // Top 20 for one-page statement
                doc.font('Helvetica').fontSize(7.5);
                for (const item of milkItems) {
                    if (currentY > 740)
                        break; // Keep inside A4 page
                    doc.rect(36, currentY, 523, 13).fill(currentY % 26 === 0 ? '#f8fafc' : '#ffffff');
                    doc.fillColor('#334155');
                    doc.text(item.itemDate || '-', 42, currentY + 3, { width: 60 });
                    doc.text(item.shiftType || '-', 105, currentY + 3, { width: 45 });
                    doc.text(item.milkCategory || '-', 155, currentY + 3, { width: 55 });
                    doc.text(Number(item.quantity).toFixed(2), 215, currentY + 3, { width: 55, align: 'right' });
                    doc.text(item.fatPercentage ? Number(item.fatPercentage).toFixed(1) : '-', 275, currentY + 3, { width: 45, align: 'right' });
                    doc.text(item.snfPercentage ? Number(item.snfPercentage).toFixed(1) : '-', 325, currentY + 3, { width: 45, align: 'right' });
                    doc.text(item.ratePerUnit ? Number(item.ratePerUnit).toFixed(2) : '-', 375, currentY + 3, { width: 65, align: 'right' });
                    doc.text(Number(item.amount).toFixed(2), 450, currentY + 3, { width: 95, align: 'right' });
                    currentY += 13;
                }
                if (items.filter(it => it.itemType === 'MILK_COLLECTION').length > 20) {
                    doc.fillColor('#64748b').fontSize(7).text(`... and ${items.length - 20} more collections recorded during this period`, 48, currentY + 2);
                    currentY += 12;
                }
                // ----------------------------------------------------
                // FOOTER & AUDIT INTEGRITY SIGNATURE
                // ----------------------------------------------------
                const footerY = 760;
                doc.rect(36, footerY, 523, 45).fill('#f1f5f9');
                doc.fillColor('#64748b').font('Helvetica').fontSize(7);
                doc.text(`Official Settlement Statement generated on: ${new Date().toISOString()}`, 44, footerY + 6);
                doc.text(`Cryptographic SHA-256 Integrity Checksum: ${statement.bill.pdfSha256Hash || 'GENERATING_SIGNATURE'}`, 44, footerY + 16);
                doc.text('This is a computer-generated statement issued by DFarm Smart Dairy Management System. Positive balance denotes amount owed by dairy; negative balance denotes amount owed by customer.', 44, footerY + 26);
                doc.text(`Authorized by: ${dairy.organizationName} Management | Finalization Status: ${bill.billStatus}`, 44, footerY + 36);
                doc.end();
            }
            catch (error) {
                reject(error);
            }
        });
    }
}
//# sourceMappingURL=pdf-statement.generator.js.map