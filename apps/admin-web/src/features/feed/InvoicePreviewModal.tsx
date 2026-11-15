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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex justify-between items-center">
          <h3 className="font-black text-lg">Cattle Feed Sale Receipt</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-lg text-white transition-colors"
          >
            &times;
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 font-mono text-xs">
          {/* Thermal Monospace Layout Preview */}
          <div className="clay-card bg-amber-50/70 p-5 border border-dashed border-amber-300 rounded-2xl shadow-inner space-y-3">
            <div className="text-center pb-3 border-b border-amber-200/80">
              <div className="font-black text-base text-slate-800">DFARM COOPERATIVE DAIRY</div>
              <div className="text-slate-600 font-bold text-[11px]">CATTLE FEED STORE SALE INVOICE</div>
              <div className="text-slate-500 text-[10px]">Tax & Subledger Integrated</div>
            </div>

            <div className="py-2 space-y-1.5 border-b border-amber-200/80">
              <div className="flex justify-between">
                <span className="text-slate-600">Invoice No:</span>
                <span className="font-black text-slate-900">{sale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Receipt No:</span>
                <span className="font-black text-slate-900">{sale.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Date:</span>
                <span className="text-slate-800">{new Date(sale.completedAt || Date.now()).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Farmer UUID:</span>
                <span className="truncate max-w-[180px] font-bold text-slate-800">{sale.customerId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Payment Mode:</span>
                <span className="font-black text-emerald-800 px-2 py-0.5 bg-emerald-100 rounded-md">{sale.paymentMode}</span>
              </div>
            </div>

            <div className="py-2 border-b border-amber-200/80 space-y-1.5">
              <div className="flex justify-between text-slate-600 font-semibold">
                <span>Subtotal:</span>
                <span>₹{Number(sale.subtotal || sale.totalAmount).toFixed(2)}</span>
              </div>
              {Number(sale.taxAmount || 0) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>GST / Tax:</span>
                  <span>₹{Number(sale.taxAmount).toFixed(2)}</span>
                </div>
              )}
              {Number(sale.discountAmount || 0) > 0 && (
                <div className="flex justify-between text-rose-600 font-bold">
                  <span>Discount Applied:</span>
                  <span>-₹{Number(sale.discountAmount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-dotted border-amber-300">
                <span>Total Amount:</span>
                <span className="text-emerald-700 text-base font-black">₹{Number(sale.totalAmount).toFixed(2)}</span>
              </div>
            </div>

            {sale.customerBalanceAfter !== undefined && sale.customerBalanceAfter !== null && (
              <div className="py-2.5 border-b border-amber-200/80 space-y-1 bg-emerald-100/60 p-3 rounded-xl border border-emerald-200">
                <div className="flex justify-between font-black text-indigo-950 text-xs">
                  <span>Farmer Subledger Balance:</span>
                  <span>₹{Number(sale.customerBalanceAfter).toFixed(2)}</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Debit Transaction ID: <span className="font-mono font-bold">{sale.ledgerTransactionId?.substring(0, 13)}...</span>
                </div>
              </div>
            )}

            <div className="text-center pt-2 text-[10px] text-slate-500 font-medium leading-relaxed">
              Double-entry balanced: Dr Customer Payable | Cr Feed Inventory
              <br />
              Authorized Server Digital Signature
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-[#F8FAFC] border-t border-slate-100 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="clay-btn-brand px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-extrabold shadow-clay-button active:scale-95 transition-all"
          >
            🖨️ Print Thermal Slip
          </button>
        </div>
      </div>
    </div>
  );
};

