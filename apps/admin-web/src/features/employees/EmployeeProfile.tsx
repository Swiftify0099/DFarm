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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
        <div className="flex justify-between items-center border-b pb-3">
          <h2 className="text-xl font-bold text-gray-800">📋 Employee Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-xl">
            ×
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading profile...</div>
        ) : error ? (
          <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
        ) : employee ? (
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex items-center space-x-4 bg-emerald-50 p-4 rounded-lg">
              <div className="w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl font-bold">
                {employee.firstName.charAt(0)}{employee.lastName.charAt(0)}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900">{employee.fullName}</h3>
                <p className="text-sm text-gray-600">
                  {employee.employeeCode} • {employee.designation} ({employee.department})
                </p>
                <div className="flex space-x-2 mt-2">
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                    employee.employmentStatus === 'ACTIVE'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {employee.employmentStatus}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-800 rounded-full">
                    {employee.employmentType}
                  </span>
                  {employee.role && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 rounded-full">
                      🔑 {employee.role}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Contact & Personal */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 block">Mobile Phone</span>
                <span className="font-semibold">{employee.mobileNumber}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Email Address</span>
                <span className="font-semibold">{employee.email || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Joining Date</span>
                <span className="font-semibold">{employee.joiningDate}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Primary Center</span>
                <span className="font-semibold">{employee.primaryCenterId || 'Unassigned'}</span>
              </div>
            </div>

            {/* Financial Details (Masked) */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-sm text-gray-700 mb-2">Banking & Masked Identification</h4>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-gray-500 block">Bank Name</span>
                  <span className="font-semibold">{employee.bankName || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Account Mask</span>
                  <span className="font-semibold">{employee.bankAccountNumberMask || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">IFSC Code</span>
                  <span className="font-semibold">{employee.bankIfsc || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-sm text-gray-700 mb-2">Emergency Contact</h4>
              {employee.emergencyContactApproved ? (
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 block">Name</span>
                    <span className="font-semibold">{employee.emergencyContactName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Phone</span>
                    <span className="font-semibold">{employee.emergencyContactPhone}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Relation</span>
                    <span className="font-semibold">{employee.emergencyContactRelation}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No approved emergency contact on file.</p>
              )}
            </div>

            {/* Salary Structure Info */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-sm text-gray-700 mb-2">Active Compensation Structure</h4>
              {employee.salaryStructure ? (
                <div className="grid grid-cols-3 gap-3 text-sm bg-gray-50 p-3 rounded">
                  <div>
                    <span className="text-gray-500 block">Basis</span>
                    <span className="font-semibold">{employee.salaryStructure.calculationBasis}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Base Salary</span>
                    <span className="font-semibold">₹{employee.salaryStructure.baseSalary.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Gross Salary</span>
                    <span className="font-semibold text-emerald-600">₹{employee.salaryStructure.grossSalary.toFixed(2)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No active salary structure assigned.</p>
              )}
            </div>

            {/* Actions */}
            <div className="border-t pt-4 flex justify-between items-center">
              <button
                onClick={() => setRoleModalOpen(true)}
                className="px-3 py-1.5 bg-purple-600 text-white rounded text-xs font-semibold hover:bg-purple-700 shadow"
              >
                🔑 Assign / Modify Role
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

        {/* Role Modal */}
        {roleModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-40 p-4">
            <div className="bg-white p-5 rounded-lg shadow-xl max-w-sm w-full space-y-4">
              <h3 className="font-bold text-gray-800 text-base">Select Staff Role</h3>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 border rounded text-sm"
              >
                <option value={UserRole.COLLECTION_OPERATOR}>Collection Operator</option>
                <option value={UserRole.SUPERVISOR}>Supervisor</option>
                <option value={UserRole.CENTER_MANAGER}>Center Manager</option>
                <option value={UserRole.REGISTRATION_OFFICER}>Registration Officer</option>
                <option value={UserRole.INVENTORY_MANAGER}>Inventory Manager</option>
                <option value={UserRole.ACCOUNTANT}>Accountant</option>
                <option value={UserRole.DAIRY_ADMIN}>Dairy Admin</option>
              </select>
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setRoleModalOpen(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 border rounded"
                >
                  Cancel
                </button>
                <button
                  disabled={roleLoading}
                  onClick={handleAssignRole}
                  className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded font-semibold hover:bg-purple-700"
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
