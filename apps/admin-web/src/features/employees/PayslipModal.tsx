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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
        <div className="flex justify-between items-center border-b pb-3">
          <div>
            <h2 className="text-xl font-bold text-gray-800">📄 Itemized Payslip</h2>
            <p className="text-xs text-gray-400 font-mono">{payslip.payslipNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-xl">
            ×
          </button>
        </div>

        {/* Employee Header */}
        <div className="bg-gray-50 p-4 rounded-lg flex justify-between items-start text-sm">
          <div>
            <h3 className="font-bold text-gray-900 text-base">{payslip.employeeName}</h3>
            <p className="text-xs text-gray-500">{payslip.employeeCode} • {payslip.designation} ({payslip.department})</p>
            <div className="text-xs text-gray-400 mt-1">
              Bank: {payslip.bankName || 'N/A'} • A/C: {payslip.bankAccountNumberMask || 'N/A'} • IFSC: {payslip.bankIfsc || 'N/A'}
            </div>
          </div>
          <div className="text-right">
            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
              payslip.paymentStatus === 'PAID'
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {payslip.paymentStatus}
            </span>
          </div>
        </div>

        {/* Attendance Days Summary */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2 border rounded bg-white">
            <span className="text-gray-500 block">Working Days</span>
            <span className="font-bold text-gray-800 text-sm">{payslip.totalWorkingDays}</span>
          </div>
          <div className="p-2 border rounded bg-white">
            <span className="text-gray-500 block">Present Days</span>
            <span className="font-bold text-emerald-700 text-sm">{payslip.presentDays}</span>
          </div>
          <div className="p-2 border rounded bg-white">
            <span className="text-gray-500 block">Paid Leaves</span>
            <span className="font-bold text-blue-700 text-sm">{payslip.paidLeaveDays}</span>
          </div>
          <div className="p-2 border rounded bg-white">
            <span className="text-gray-500 block">Overtime</span>
            <span className="font-bold text-purple-700 text-sm">{payslip.overtimeHours}h</span>
          </div>
        </div>

        {/* Itemized Breakdown Table */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Earnings */}
          <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
            <h4 className="font-bold text-emerald-800 border-b pb-1 uppercase">Earnings (Cr)</h4>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Earned Basic Salary</span>
              <span className="font-semibold">₹{payslip.earnedBasic.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">House Rent Allowance (HRA)</span>
              <span className="font-semibold">₹{payslip.hra.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Travel Allowance</span>
              <span className="font-semibold">₹{payslip.travelAllowance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Special Allowance</span>
              <span className="font-semibold">₹{payslip.specialAllowance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Medical Allowance</span>
              <span className="font-semibold">₹{payslip.medicalAllowance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Overtime Earnings</span>
              <span className="font-semibold">₹{payslip.overtimeAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 font-bold text-gray-900 text-sm">
              <span>Gross Earnings:</span>
              <span className="text-emerald-700">₹{payslip.grossEarnings.toFixed(2)}</span>
            </div>
          </div>

          {/* Deductions */}
          <div className="border rounded-lg p-3 space-y-2 bg-gray-50">
            <h4 className="font-bold text-red-800 border-b pb-1 uppercase">Deductions (Dr)</h4>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Provident Fund (Employee)</span>
              <span className="font-semibold text-red-600">₹{payslip.pfDeduction.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Taxes (Prof. / TDS)</span>
              <span className="font-semibold text-red-600">₹{payslip.taxDeduction.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Employee Advance Recovery</span>
              <span className="font-semibold text-red-600">₹{payslip.advanceRecovery.toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-gray-600">Other Authorized Deductions</span>
              <span className="font-semibold text-red-600">₹{payslip.otherDeductions.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 font-bold text-gray-900 text-sm">
              <span>Total Deductions:</span>
              <span className="text-red-700">₹{payslip.totalDeductions.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Net Pay Banner */}
        <div className="bg-emerald-600 text-white rounded-lg p-4 flex justify-between items-center">
          <div>
            <span className="text-xs uppercase font-medium text-emerald-100 block">Take-Home Pay</span>
            <span className="text-2xl font-extrabold">₹{payslip.netSalary.toFixed(2)}</span>
          </div>
          <div className="text-right">
            <span className="text-xs text-emerald-100 block">Calculation Method</span>
            <span className="text-xs font-semibold bg-emerald-700 px-2 py-0.5 rounded">Exact NUMERIC</span>
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex justify-between items-center border-t pt-4">
          {payslip.paymentStatus !== 'PAID' ? (
            <button
              onClick={() => setIsPayModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-lg shadow"
            >
              💳 Record Salary Payout
            </button>
          ) : (
            <div className="text-xs text-green-700 font-bold flex items-center gap-1">
              <span>✅</span> Disbursed to Employee Financial Ledger
            </div>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold text-sm rounded-lg"
          >
            Close
          </button>
        </div>

        {/* Payment Disbursement Submodal */}
        {isPayModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-40 p-4">
            <div className="bg-white p-5 rounded-lg shadow-xl max-w-sm w-full space-y-4">
              <h3 className="font-bold text-gray-800 text-base">Disburse Employee Salary</h3>
              <p className="text-xs text-gray-500">
                Amount: <strong>₹{payslip.netSalary.toFixed(2)}</strong> for {payslip.employeeName}
              </p>

              <form onSubmit={handleDisbursePayment} className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as SalaryPaymentMethod)}
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                  >
                    <option value={SalaryPaymentMethod.BANK_TRANSFER}>Bank Transfer (NEFT/RTGS)</option>
                    <option value={SalaryPaymentMethod.UPI}>UPI</option>
                    <option value={SalaryPaymentMethod.CHEQUE}>Cheque</option>
                    <option value={SalaryPaymentMethod.CASH}>Cash</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase">Bank Transaction Reference / UTR</label>
                  <input
                    type="text"
                    placeholder="e.g. UTR123456789"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setIsPayModalOpen(false)}
                    className="px-3 py-1.5 border rounded text-gray-600 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={payLoading}
                    className="px-4 py-1.5 bg-emerald-600 text-white rounded font-bold text-xs hover:bg-emerald-700"
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
