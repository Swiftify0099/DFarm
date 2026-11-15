import React, { useState } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import {
  type Employee,
  EmploymentStatus,
  EmploymentType,
  UserRole,
} from '@dfarm/shared-types';

interface EmployeeRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (emp: Employee) => void;
}

export const EmployeeRegistrationModal: React.FC<EmployeeRegistrationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    employeeCode: '',
    mobileNumber: '',
    email: '',
    designation: '',
    department: 'OPERATIONS',
    joiningDate: new Date().toISOString().split('T')[0],
    employmentStatus: EmploymentStatus.ACTIVE,
    employmentType: EmploymentType.FULL_TIME,
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    nationalIdMask: '',
    bankName: '',
    bankAccountNumberMask: '',
    bankIfsc: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
    emergencyContactApproved: false,
    createUserAccount: false,
    role: UserRole.COLLECTION_OPERATOR,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        mobileNumber: formData.mobileNumber,
        designation: formData.designation,
        department: formData.department,
        joiningDate: formData.joiningDate,
        employmentStatus: formData.employmentStatus,
        employmentType: formData.employmentType,
        emergencyContactApproved: formData.emergencyContactApproved,
      };

      if (formData.employeeCode) payload.employeeCode = formData.employeeCode;
      if (formData.email) payload.email = formData.email;
      if (formData.addressLine1) payload.addressLine1 = formData.addressLine1;
      if (formData.city) payload.city = formData.city;
      if (formData.state) payload.state = formData.state;
      if (formData.postalCode) payload.postalCode = formData.postalCode;
      if (formData.nationalIdMask) payload.nationalIdMask = formData.nationalIdMask;
      if (formData.bankName) payload.bankName = formData.bankName;
      if (formData.bankAccountNumberMask) payload.bankAccountNumberMask = formData.bankAccountNumberMask;
      if (formData.bankIfsc) payload.bankIfsc = formData.bankIfsc;

      if (formData.emergencyContactApproved) {
        payload.emergencyContactName = formData.emergencyContactName;
        payload.emergencyContactPhone = formData.emergencyContactPhone;
        payload.emergencyContactRelation = formData.emergencyContactRelation;
      }

      if (formData.createUserAccount) {
        payload.createUserAccount = true;
        payload.role = formData.role;
      }

      const res = await employeeApi.createEmployee(payload);
      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to register employee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 border border-white">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h2 className="text-xl font-black text-slate-800 tracking-tight">👤 Register New Employee</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-lg text-slate-600 transition-colors"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold rounded-2xl shadow-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">First Name *</label>
              <input
                required
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Last Name *</label>
              <input
                required
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Employee Code (Optional)</label>
              <input
                type="text"
                placeholder="Auto-generated if empty"
                value={formData.employeeCode}
                onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Mobile Number *</label>
              <input
                required
                type="text"
                value={formData.mobileNumber}
                onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Joining Date *</label>
              <input
                required
                type="date"
                value={formData.joiningDate}
                onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Designation *</label>
              <input
                required
                type="text"
                placeholder="e.g. Center Operator, Manager"
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>

            <div>
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Department *</label>
              <select
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              >
                <option value="OPERATIONS">Operations</option>
                <option value="FINANCE">Finance</option>
                <option value="PROCUREMENT">Procurement</option>
                <option value="ADMIN">Administration</option>
                <option value="MANAGEMENT">Management</option>
                <option value="LOGISTICS">Logistics</option>
              </select>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 mb-2">Emergency Contact (Requires Explicit Approval)</h3>
            <div className="flex items-center space-x-2.5 mb-3">
              <input
                type="checkbox"
                id="emergencyContactApproved"
                checked={formData.emergencyContactApproved}
                onChange={(e) => setFormData({ ...formData, emergencyContactApproved: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <label htmlFor="emergencyContactApproved" className="text-xs font-bold text-slate-700 cursor-pointer">
                Approve emergency contact inclusion
              </label>
            </div>

            {formData.emergencyContactApproved && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Contact Name"
                  value={formData.emergencyContactName}
                  onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                  className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
                <input
                  type="text"
                  placeholder="Contact Phone"
                  value={formData.emergencyContactPhone}
                  onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                  className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
                <input
                  type="text"
                  placeholder="Relation (e.g. Spouse, Parent)"
                  value={formData.emergencyContactRelation}
                  onChange={(e) => setFormData({ ...formData, emergencyContactRelation: e.target.value })}
                  className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
              </div>
            )}
          </div>

          {/* Bank & Sensitive Details */}
          <div className="border-t border-slate-100 pt-4">
            <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 mb-2">Financial & Banking Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Bank Name"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
              <input
                type="text"
                placeholder="Bank Account Number"
                value={formData.bankAccountNumberMask}
                onChange={(e) => setFormData({ ...formData, bankAccountNumberMask: e.target.value })}
                className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
              <input
                type="text"
                placeholder="Bank IFSC Code"
                value={formData.bankIfsc}
                onChange={(e) => setFormData({ ...formData, bankIfsc: e.target.value })}
                className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              />
            </div>
          </div>

          {/* Staff Access / Role */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center space-x-2.5 mb-3">
              <input
                type="checkbox"
                id="createUserAccount"
                checked={formData.createUserAccount}
                onChange={(e) => setFormData({ ...formData, createUserAccount: e.target.checked })}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <label htmlFor="createUserAccount" className="text-xs font-extrabold text-slate-700 cursor-pointer">
                Grant Application Access & Assign Staff Role
              </label>
            </div>

            {formData.createUserAccount && (
              <div className="w-full md:w-1/2">
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Assigned Staff Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                >
                  <option value={UserRole.COLLECTION_OPERATOR}>Collection Operator</option>
                  <option value={UserRole.SUPERVISOR}>Supervisor</option>
                  <option value={UserRole.CENTER_MANAGER}>Center Manager</option>
                  <option value={UserRole.REGISTRATION_OFFICER}>Registration Officer</option>
                  <option value={UserRole.INVENTORY_MANAGER}>Inventory Manager</option>
                  <option value={UserRole.ACCOUNTANT}>Accountant</option>
                  <option value={UserRole.DAIRY_ADMIN}>Dairy Admin</option>
                </select>
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 pt-4 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="clay-btn-brand px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-extrabold shadow-clay-button disabled:opacity-50 active:scale-95 transition-all"
            >
              {loading ? 'Registering...' : 'Register Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
