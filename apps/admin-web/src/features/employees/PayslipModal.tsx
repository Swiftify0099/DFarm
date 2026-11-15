import React, { useState } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import { type EmployeePayslip, SalaryPaymentMethod } from '@dfarm/shared-types';

interface PayslipModalProps {
  payslip: EmployeePayslip | null;
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess?: () => void;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({
  payslip,
  isOpen,
  onClose,
  onPaymentSuccess,
}) => {
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<SalaryPaymentMethod>(SalaryPaymentMethod.BANK_TRANSFER);
  const [transactionId, setTransactionId] = useState('');
  const [payLoading, setPayLoading] = useState(false);

  if (!isOpen || !payslip) return null;

  const handleDisbursePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayLoading(true);
    try {
      await employeeApi.recordSalaryPayment({
        payrollRunId: payslip.payrollRunId,
        payslipId: payslip.id,
        employeeId: payslip.employeeId,
        amount: payslip.netSalary,
        paymentMethod,
        transactionId: transactionId || undefined,
        bankName: payslip.bankName || undefined,
        bankAccountMask: payslip.bankAccountNumberMask || undefined,
        bankIfsc: payslip.bankIfsc || undefined,
      });
      alert('Salary payment recorded successfully into employee financial ledger!');
      setIsPayModalOpen(false);
      onPaymentSuccess?.();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Payment recording failed');
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 border border-white">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">📄 Itemized Payslip</h2>
            <p className="text-xs text-slate-400 font-mono font-bold">{payslip.payslipNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-lg text-slate-600 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Employee Header */}
        <div className="clay-card bg-[#F8FAFC] p-5 rounded-2xl flex justify-between items-start text-sm border border-slate-200/80 shadow-sm">
          <div>
            <h3 className="font-black text-slate-900 text-base">{payslip.employeeName}</h3>
            <p className="text-xs text-slate-500 font-medium">{payslip.employeeCode} • {payslip.designation} ({payslip.department})</p>
            <div className="text-xs text-slate-400 mt-1 font-mono">
              Bank: {payslip.bankName || 'N/A'} • A/C: {payslip.bankAccountNumberMask || 'N/A'} • IFSC: {payslip.bankIfsc || 'N/A'}
            </div>
          </div>
          <div className="text-right">
            <span className={`px-3 py-1 text-xs font-black rounded-full ${
              payslip.paymentStatus === 'PAID'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                : 'bg-amber-100 text-amber-800 border border-amber-200'
            }`}>
              {payslip.paymentStatus}
            </span>
          </div>
        </div>

        {/* Attendance Days Summary */}
        <div className="grid grid-cols-4 gap-2.5 text-center text-xs">
          <div className="clay-card p-3 rounded-xl bg-white border border-slate-200/80 shadow-sm">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Working Days</span>
            <span className="font-black text-slate-800 text-base mt-0.5 block">{payslip.totalWorkingDays}</span>
          </div>
          <div className="clay-card p-3 rounded-xl bg-white border border-slate-200/80 shadow-sm">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Present Days</span>
            <span className="font-black text-emerald-700 text-base mt-0.5 block">{payslip.presentDays}</span>
          </div>
          <div className="clay-card p-3 rounded-xl bg-white border border-slate-200/80 shadow-sm">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Paid Leaves</span>
            <span className="font-black text-sky-700 text-base mt-0.5 block">{payslip.paidLeaveDays}</span>
          </div>
          <div className="clay-card p-3 rounded-xl bg-white border border-slate-200/80 shadow-sm">
            <span className="text-slate-400 block text-[10px] uppercase font-bold">Overtime</span>
            <span className="font-black text-purple-700 text-base mt-0.5 block">{payslip.overtimeHours}h</span>
          </div>
        </div>

        {/* Itemized Breakdown Table */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Earnings */}
          <div className="clay-card border border-slate-200/80 rounded-2xl p-4 space-y-2 bg-[#F8FAFC] shadow-sm">
            <h4 className="font-extrabold text-emerald-800 border-b border-slate-200 pb-1.5 uppercase tracking-wider text-[11px]">Earnings (Cr)</h4>
            <div className="flex justify-between py-1 border-b border-slate-200/60 font-medium">
              <span className="text-slate-600">Earned Basic Salary</span>
              <span className="font-bold text-slate-800">₹{payslip.earnedBasic.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/60 font-medium">
              <span className="text-slate-600">House Rent Allowance (HRA)</span>
              <span className="font-bold text-slate-800">₹{payslip.hra.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/60 font-medium">
              <span className="text-slate-600">Travel Allowance</span>
              <span className="font-bold text-slate-800">₹{payslip.travelAllowance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/60 font-medium">
              <span className="text-slate-600">Special Allowance</span>
              <span className="font-bold text-slate-800">₹{payslip.specialAllowance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/60 font-medium">
              <span className="text-slate-600">Medical Allowance</span>
              <span className="font-bold text-slate-800">₹{payslip.medicalAllowance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/60 font-medium">
              <span className="text-slate-600">Overtime Earnings</span>
              <span className="font-bold text-slate-800">₹{payslip.overtimeAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 font-black text-slate-900 text-sm">
              <span>Gross Earnings:</span>
              <span className="text-emerald-700 font-black">₹{payslip.grossEarnings.toFixed(2)}</span>
            </div>
          </div>

          {/* Deductions */}
          <div className="clay-card border border-slate-200/80 rounded-2xl p-4 space-y-2 bg-[#F8FAFC] shadow-sm">
            <h4 className="font-extrabold text-rose-800 border-b border-slate-200 pb-1.5 uppercase tracking-wider text-[11px]">Deductions (Dr)</h4>
            <div className="flex justify-between py-1 border-b border-slate-200/60 font-medium">
              <span className="text-slate-600">Provident Fund (Employee)</span>
              <span className="font-bold text-rose-600">₹{payslip.pfDeduction.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/60 font-medium">
              <span className="text-slate-600">Taxes (Prof. / TDS)</span>
              <span className="font-bold text-rose-600">₹{payslip.taxDeduction.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/60 font-medium">
              <span className="text-slate-600">Employee Advance Recovery</span>
              <span className="font-bold text-rose-600">₹{payslip.advanceRecovery.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-200/60 font-medium">
              <span className="text-slate-600">Other Authorized Deductions</span>
              <span className="font-bold text-rose-600">₹{payslip.otherDeductions.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 font-black text-slate-900 text-sm">
              <span>Total Deductions:</span>
              <span className="text-rose-700 font-black">₹{payslip.totalDeductions.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Net Pay Banner */}
        <div className="clay-card bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-5 flex justify-between items-center shadow-clay-button border border-emerald-500/50">
          <div>
            <span className="text-[11px] uppercase font-bold tracking-wider text-emerald-100 block">Take-Home Pay</span>
            <span className="text-3xl font-black mt-0.5 block">₹{payslip.netSalary.toFixed(2)}</span>
          </div>
          <div className="text-right">
            <span className="text-[11px] text-emerald-100 font-bold block">Calculation Method</span>
            <span className="text-xs font-black bg-emerald-800/60 px-3 py-1 rounded-full border border-emerald-400/40 mt-1 inline-block">Exact NUMERIC</span>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex justify-between items-center border-t border-slate-100 pt-4">
          {payslip.paymentStatus !== 'PAID' ? (
            <button
              onClick={() => setIsPayModalOpen(true)}
              className="clay-btn-brand px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-extrabold text-sm rounded-xl shadow-clay-button active:scale-95 transition-all"
            >
              💳 Record Salary Payout
            </button>
          ) : (
            <div className="text-xs text-emerald-800 font-extrabold flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-xl border border-emerald-200">
              <span>✅</span> Disbursed to Employee Financial Ledger
            </div>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl active:scale-95 transition-all"
          >
            Close
          </button>
        </div>

        {/* Payment Disbursement Submodal */}
        {isPayModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="clay-card bg-white p-6 rounded-3xl shadow-2xl max-w-sm w-full space-y-4 border border-white">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-black text-slate-800 text-base">Disburse Employee Salary</h3>
                <button
                  onClick={() => setIsPayModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold text-xl"
                >
                  &times;
                </button>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Amount: <strong className="text-emerald-700">₹{payslip.netSalary.toFixed(2)}</strong> for {payslip.employeeName}
              </p>

              <form onSubmit={handleDisbursePayment} className="space-y-3.5 text-sm">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as SalaryPaymentMethod)}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  >
                    <option value={SalaryPaymentMethod.BANK_TRANSFER}>Bank Transfer (NEFT/RTGS)</option>
                    <option value={SalaryPaymentMethod.UPI}>UPI</option>
                    <option value={SalaryPaymentMethod.CHEQUE}>Cheque</option>
                    <option value={SalaryPaymentMethod.CASH}>Cash</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Bank Transaction Reference / UTR</label>
                  <input
                    type="text"
                    placeholder="e.g. UTR123456789"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsPayModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={payLoading}
                    className="clay-btn-brand px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl font-extrabold text-xs shadow-clay-button disabled:opacity-50 active:scale-95 transition-all"
                  >
                    {payLoading ? 'Recording...' : 'Confirm Disbursement'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
