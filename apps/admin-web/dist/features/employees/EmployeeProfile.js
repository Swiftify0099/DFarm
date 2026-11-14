import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import { UserRole } from '@dfarm/shared-types';
export const EmployeeProfile = ({ employeeId, isOpen, onClose, onRoleAssigned, }) => {
    const [employee, setEmployee] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [roleModalOpen, setRoleModalOpen] = useState(false);
    const [selectedRole, setSelectedRole] = useState(UserRole.COLLECTION_OPERATOR);
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
            if (data.role)
                setSelectedRole(data.role);
        }
        catch (err) {
            setError(err.message || 'Failed to load employee profile');
        }
        finally {
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
        }
        catch (err) {
            alert(err.message || 'Failed to assign role');
        }
        finally {
            setRoleLoading(false);
        }
    };
    if (!isOpen)
        return null;
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4", children: _jsxs("div", { className: "bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6", children: [_jsxs("div", { className: "flex justify-between items-center border-b pb-3", children: [_jsx("h2", { className: "text-xl font-bold text-gray-800", children: "\uD83D\uDCCB Employee Profile" }), _jsx("button", { onClick: onClose, className: "text-gray-400 hover:text-gray-600 font-bold text-xl", children: "\u00D7" })] }), loading ? (_jsx("div", { className: "text-center py-8 text-gray-500", children: "Loading profile..." })) : error ? (_jsx("div", { className: "p-3 bg-red-50 text-red-700 rounded text-sm", children: error })) : employee ? (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center space-x-4 bg-emerald-50 p-4 rounded-lg", children: [_jsxs("div", { className: "w-16 h-16 rounded-full bg-emerald-600 text-white flex items-center justify-center text-2xl font-bold", children: [employee.firstName.charAt(0), employee.lastName.charAt(0)] }), _jsxs("div", { className: "flex-1", children: [_jsx("h3", { className: "text-lg font-bold text-gray-900", children: employee.fullName }), _jsxs("p", { className: "text-sm text-gray-600", children: [employee.employeeCode, " \u2022 ", employee.designation, " (", employee.department, ")"] }), _jsxs("div", { className: "flex space-x-2 mt-2", children: [_jsx("span", { className: `px-2 py-0.5 text-xs font-semibold rounded-full ${employee.employmentStatus === 'ACTIVE'
                                                        ? 'bg-green-100 text-green-800'
                                                        : 'bg-amber-100 text-amber-800'}`, children: employee.employmentStatus }), _jsx("span", { className: "px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-800 rounded-full", children: employee.employmentType }), employee.role && (_jsxs("span", { className: "px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 rounded-full", children: ["\uD83D\uDD11 ", employee.role] }))] })] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4 text-sm", children: [_jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Mobile Phone" }), _jsx("span", { className: "font-semibold", children: employee.mobileNumber })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Email Address" }), _jsx("span", { className: "font-semibold", children: employee.email || 'N/A' })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Joining Date" }), _jsx("span", { className: "font-semibold", children: employee.joiningDate })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Primary Center" }), _jsx("span", { className: "font-semibold", children: employee.primaryCenterId || 'Unassigned' })] })] }), _jsxs("div", { className: "border-t pt-4", children: [_jsx("h4", { className: "font-semibold text-sm text-gray-700 mb-2", children: "Banking & Masked Identification" }), _jsxs("div", { className: "grid grid-cols-3 gap-3 text-sm", children: [_jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Bank Name" }), _jsx("span", { className: "font-semibold", children: employee.bankName || 'N/A' })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Account Mask" }), _jsx("span", { className: "font-semibold", children: employee.bankAccountNumberMask || 'N/A' })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "IFSC Code" }), _jsx("span", { className: "font-semibold", children: employee.bankIfsc || 'N/A' })] })] })] }), _jsxs("div", { className: "border-t pt-4", children: [_jsx("h4", { className: "font-semibold text-sm text-gray-700 mb-2", children: "Emergency Contact" }), employee.emergencyContactApproved ? (_jsxs("div", { className: "grid grid-cols-3 gap-3 text-sm", children: [_jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Name" }), _jsx("span", { className: "font-semibold", children: employee.emergencyContactName })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Phone" }), _jsx("span", { className: "font-semibold", children: employee.emergencyContactPhone })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Relation" }), _jsx("span", { className: "font-semibold", children: employee.emergencyContactRelation })] })] })) : (_jsx("p", { className: "text-sm text-gray-500 italic", children: "No approved emergency contact on file." }))] }), _jsxs("div", { className: "border-t pt-4", children: [_jsx("h4", { className: "font-semibold text-sm text-gray-700 mb-2", children: "Active Compensation Structure" }), employee.salaryStructure ? (_jsxs("div", { className: "grid grid-cols-3 gap-3 text-sm bg-gray-50 p-3 rounded", children: [_jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Basis" }), _jsx("span", { className: "font-semibold", children: employee.salaryStructure.calculationBasis })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Base Salary" }), _jsxs("span", { className: "font-semibold", children: ["\u20B9", employee.salaryStructure.baseSalary.toFixed(2)] })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500 block", children: "Gross Salary" }), _jsxs("span", { className: "font-semibold text-emerald-600", children: ["\u20B9", employee.salaryStructure.grossSalary.toFixed(2)] })] })] })) : (_jsx("p", { className: "text-sm text-gray-500 italic", children: "No active salary structure assigned." }))] }), _jsxs("div", { className: "border-t pt-4 flex justify-between items-center", children: [_jsx("button", { onClick: () => setRoleModalOpen(true), className: "px-3 py-1.5 bg-purple-600 text-white rounded text-xs font-semibold hover:bg-purple-700 shadow", children: "\uD83D\uDD11 Assign / Modify Role" }), _jsx("button", { onClick: onClose, className: "px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm font-semibold", children: "Close" })] })] })) : null, roleModalOpen && (_jsx("div", { className: "fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-40 p-4", children: _jsxs("div", { className: "bg-white p-5 rounded-lg shadow-xl max-w-sm w-full space-y-4", children: [_jsx("h3", { className: "font-bold text-gray-800 text-base", children: "Select Staff Role" }), _jsxs("select", { value: selectedRole, onChange: (e) => setSelectedRole(e.target.value), className: "w-full px-3 py-2 border rounded text-sm", children: [_jsx("option", { value: UserRole.COLLECTION_OPERATOR, children: "Collection Operator" }), _jsx("option", { value: UserRole.SUPERVISOR, children: "Supervisor" }), _jsx("option", { value: UserRole.CENTER_MANAGER, children: "Center Manager" }), _jsx("option", { value: UserRole.REGISTRATION_OFFICER, children: "Registration Officer" }), _jsx("option", { value: UserRole.INVENTORY_MANAGER, children: "Inventory Manager" }), _jsx("option", { value: UserRole.ACCOUNTANT, children: "Accountant" }), _jsx("option", { value: UserRole.DAIRY_ADMIN, children: "Dairy Admin" })] }), _jsxs("div", { className: "flex justify-end space-x-2", children: [_jsx("button", { onClick: () => setRoleModalOpen(false), className: "px-3 py-1.5 text-sm text-gray-600 border rounded", children: "Cancel" }), _jsx("button", { disabled: roleLoading, onClick: handleAssignRole, className: "px-3 py-1.5 text-sm bg-purple-600 text-white rounded font-semibold hover:bg-purple-700", children: roleLoading ? 'Saving...' : 'Confirm Role' })] })] }) }))] }) }));
};
//# sourceMappingURL=EmployeeProfile.js.map