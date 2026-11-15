import React, { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import { type Employee, UserRole } from '@dfarm/shared-types';

interface EmployeeProfileProps {
  employeeId: string;
  isOpen: boolean;
  onClose: () => void;
  onRoleAssigned?: () => void;
}

export const EmployeeProfile: React.FC<EmployeeProfileProps> = ({
  employeeId,
  isOpen,
  onClose,
  onRoleAssigned,
}) => {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.COLLECTION_OPERATOR);
  const [roleLoading, setRoleLoading] = useState(false);

  useEffect(() => {
    if (isOpen && employeeId) {
      loadEmployee();
    }
  }, [isOpen, employeeId]);

  const loadEmployee = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await employeeApi.getEmployeeById(employeeId);
      setEmployee(data);
      if (data.role) setSelectedRole(data.role);
    } catch (err: any) {
      setError(err.message || 'Failed to load employee profile');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRole = async () => {
    setRoleLoading(true);
    try {
      await employeeApi.assignRole(employeeId, { role: selectedRole });
      setRoleModalOpen(false);
      loadEmployee();
      onRoleAssigned?.();
    } catch (err: any) {
      alert(err.message || 'Failed to assign role');
    } finally {
      setRoleLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 border border-white">
        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
          <h2 className="text-xl font-black text-slate-800 tracking-tight">📋 Employee Profile</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-lg text-slate-600 transition-colors"
          >
            &times;
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm font-semibold space-y-2">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div>Loading profile...</div>
          </div>
        ) : error ? (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-sm font-semibold shadow-sm">{error}</div>
        ) : employee ? (
          <div className="space-y-6">
            {/* Header info */}
            <div className="clay-card flex items-center space-x-4 bg-gradient-to-r from-emerald-50/80 to-teal-50/60 p-5 rounded-2xl border border-emerald-200/80 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center text-2xl font-black shadow-clay-button border border-white/40">
                {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-black text-slate-900">{employee.fullName}</h3>
                <p className="text-xs text-slate-600 font-medium">
                  {employee.employeeCode} • {employee.designation} ({employee.department})
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <span className={`px-2.5 py-0.5 text-xs font-extrabold rounded-full ${
                    employee.employmentStatus === 'ACTIVE'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    {employee.employmentStatus}
                  </span>
                  <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                    {employee.employmentType}
                  </span>
                  {employee.role && (
                    <span className="px-2.5 py-0.5 text-xs font-bold bg-purple-100 text-purple-800 rounded-full border border-purple-200">
                      🔑 {employee.role}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Contact & Personal */}
            <div className="clay-inset p-4 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 grid grid-cols-2 gap-4 text-xs font-medium text-slate-600">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">Mobile Phone</span>
                <span className="font-black text-slate-800 text-sm">{employee.mobileNumber}</span>
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">Email Address</span>
                <span className="font-bold text-slate-800">{employee.email || 'N/A'}</span>
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">Joining Date</span>
                <span className="font-bold text-slate-800">{employee.joiningDate}</span>
              </div>
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">Primary Center</span>
                <span className="font-bold text-slate-800">{employee.primaryCenterId || 'Unassigned'}</span>
              </div>
            </div>

            {/* Financial Details (Masked) */}
            <div className="border-t border-slate-100 pt-4">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 mb-2">Banking & Masked Identification</h4>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="clay-card p-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Bank Name</span>
                  <span className="font-bold text-slate-800">{employee.bankName || 'N/A'}</span>
                </div>
                <div className="clay-card p-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Account Mask</span>
                  <span className="font-mono font-bold text-slate-800">{employee.bankAccountNumberMask || 'N/A'}</span>
                </div>
                <div className="clay-card p-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">IFSC Code</span>
                  <span className="font-mono font-bold text-slate-800">{employee.bankIfsc || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="border-t border-slate-100 pt-4">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 mb-2">Emergency Contact</h4>
              {employee.emergencyContactApproved ? (
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="clay-card p-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Name</span>
                    <span className="font-bold text-slate-800">{employee.emergencyContactName}</span>
                  </div>
                  <div className="clay-card p-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Phone</span>
                    <span className="font-bold text-slate-800">{employee.emergencyContactPhone}</span>
                  </div>
                  <div className="clay-card p-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 shadow-sm">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Relation</span>
                    <span className="font-bold text-slate-800">{employee.emergencyContactRelation}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No approved emergency contact on file.</p>
              )}
            </div>

            {/* Salary Structure Info */}
            <div className="border-t border-slate-100 pt-4">
              <h4 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 mb-2">Active Compensation Structure</h4>
              {employee.salaryStructure ? (
                <div className="grid grid-cols-3 gap-3 text-xs clay-card bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200/80 shadow-sm">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Basis</span>
                    <span className="font-bold text-slate-800">{employee.salaryStructure.calculationBasis}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Base Salary</span>
                    <span className="font-bold text-slate-800">₹{employee.salaryStructure.baseSalary.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Gross Salary</span>
                    <span className="font-black text-emerald-700 text-sm">₹{employee.salaryStructure.grossSalary.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No active salary structure assigned.</p>
              )}
            </div>

            {/* Actions */}
            <div className="border-t border-slate-100 pt-4 flex justify-between items-center">
              <button
                onClick={() => setRoleModalOpen(true)}
                className="clay-btn-brand px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-clay-button active:scale-95 transition-all"
              >
                🔑 Assign / Modify Role
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold active:scale-95 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

        {/* Role Modal */}
        {roleModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="clay-card bg-white p-6 rounded-3xl shadow-2xl max-w-sm w-full space-y-4 border border-white">
              <h3 className="font-black text-slate-800 text-base">Select Staff Role</h3>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-sm"
              >
                <option value={UserRole.COLLECTION_OPERATOR}>Collection Operator</option>
                <option value={UserRole.SUPERVISOR}>Supervisor</option>
                <option value={UserRole.CENTER_MANAGER}>Center Manager</option>
                <option value={UserRole.REGISTRATION_OFFICER}>Registration Officer</option>
                <option value={UserRole.INVENTORY_MANAGER}>Inventory Manager</option>
                <option value={UserRole.ACCOUNTANT}>Accountant</option>
                <option value={UserRole.DAIRY_ADMIN}>Dairy Admin</option>
              </select>
              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setRoleModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  disabled={roleLoading}
                  onClick={handleAssignRole}
                  className="clay-btn-brand px-5 py-2 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-500 hover:to-indigo-600 text-white rounded-xl text-xs font-bold shadow-clay-button active:scale-95 transition-all"
                >
                  {roleLoading ? 'Saving...' : 'Confirm Role'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
