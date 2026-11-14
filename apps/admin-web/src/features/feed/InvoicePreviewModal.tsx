import React from 'react';

interface InvoicePreviewModalProps {
  sale: any;
  onClose: () => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({ sale, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 bg-emerald-700 text-white flex justify-between items-center">
          <h3 className="font-bold text-lg">Cattle Feed Sale Receipt</h3>
          <button onClick={onClose} className="text-white hover:text-gray-200 font-bold text-xl">&times;</button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 font-mono text-xs">
          {/* Thermal Monospace Layout Preview */}
          <div className="bg-amber-50/50 p-4 border border-dashed border-gray-400 rounded">
            <div className="text-center pb-2 border-b border-gray-300">
              <div className="font-bold text-sm">DFARM COOPERATIVE DAIRY</div>
              <div className="text-gray-600">CATTLE FEED STORE SALE INVOICE</div>
              <div className="text-gray-500 text-[10px]">Tax & Subledger Integrated</div>
            </div>

            <div className="py-2 space-y-1 border-b border-gray-300">
              <div className="flex justify-between">
                <span>Invoice No:</span>
                <span className="font-bold">{sale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Receipt No:</span>
                <span className="font-bold">{sale.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date(sale.completedAt || Date.now()).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Farmer UUID:</span>
                <span className="truncate max-w-[180px]">{sale.customerId}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Mode:</span>
                <span className="font-bold text-emerald-800">{sale.paymentMode}</span>
              </div>
            </div>

            <div className="py-2 border-b border-gray-300 space-y-1">
              <div className="flex justify-between text-gray-600 font-semibold">
                <span>Subtotal:</span>
                <span>₹{Number(sale.subtotal || sale.totalAmount).toFixed(2)}</span>
              </div>
              {Number(sale.taxAmount || 0) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span>GST / Tax:</span>
                  <span>₹{Number(sale.taxAmount).toFixed(2)}</span>
                </div>
              )}
              {Number(sale.discountAmount || 0) > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount Applied:</span>
                  <span>-₹{Number(sale.discountAmount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-dotted">
                <span>Total Amount:</span>
                <span className="text-emerald-700">₹{Number(sale.totalAmount).toFixed(2)}</span>
              </div>
            </div>

            {sale.customerBalanceAfter !== undefined && sale.customerBalanceAfter !== null && (
              <div className="py-2 border-b border-gray-300 space-y-1 bg-emerald-50/50 p-2 rounded">
                <div className="flex justify-between font-bold text-indigo-900">
                  <span>Farmer Subledger Balance:</span>
                  <span>₹{Number(sale.customerBalanceAfter).toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-gray-500">
                  Debit Transaction ID: <span className="font-mono">{sale.ledgerTransactionId?.substring(0, 13)}...</span>
                </div>
              </div>
            )}

            <div className="text-center pt-3 text-[10px] text-gray-500">
              Double-entry balanced: Dr Customer Payable | Cr Feed Inventory
              <br />
              Authorized Server Digital Signature
            </div>
          </div>
        </div>

        <div className="px-6 py-3 bg-gray-100 border-t flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded text-xs font-semibold text-gray-700 hover:bg-gray-200"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold shadow"
          >
            Print Thermal Slip
          </button>
        </div>
      </div>
    </div>
  );
};

