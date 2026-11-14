import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import { AttendanceStatus, } from '@dfarm/shared-types';
export const AttendanceManagement = () => {
    const [records, setRecords] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [statusFilter, setStatusFilter] = useState('');
    const [shiftFilter, setShiftFilter] = useState('');
    // Correction modal state
    const [selectedAttendance, setSelectedAttendance] = useState(null);
    const [correctionReason, setCorrectionReason] = useState('');
    const [correctionStatus, setCorrectionStatus] = useState(AttendanceStatus.PRESENT);
    const [correctionOvertime, setCorrectionOvertime] = useState(0);
    const [correctionLoading, setCorrectionLoading] = useState(false);
    const fetchAttendance = async () => {
        setLoading(true);
        setError(null);
        try {
            const [attData, shiftData] = await Promise.all([
                employeeApi.getAttendance({
                    startDate: selectedDate,
                    endDate: selectedDate,
                    status: statusFilter || undefined,
                }),
                employeeApi.getShifts(),
            ]);
            setRecords(attData.records);
            setShifts(shiftData);
        }
        catch (err) {
            setError(err.message || 'Failed to fetch attendance');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchAttendance();
    }, [selectedDate, statusFilter]);
    const handleCorrectionSubmit = async (e) => {
        e.preventDefault();
        if (!selectedAttendance)
            return;
        setCorrectionLoading(true);
        try {
            await employeeApi.correctAttendance(selectedAttendance.id, {
                status: correctionStatus,
                overtimeHours: correctionOvertime,
                reason: correctionReason,
            });
            setSelectedAttendance(null);
            setCorrectionReason('');
            fetchAttendance();
        }
        catch (err) {
            alert(err.message || 'Failed to submit correction');
        }
        finally {
            setCorrectionLoading(false);
        }
    };
    const displayedRecords = shiftFilter
        ? records.filter((r) => r.shiftType === shiftFilter)
        : records;
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("div", { className: "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100", children: _jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold text-gray-800", children: "\u23F1\uFE0F Staff Attendance & Shifts" }), _jsx("p", { className: "text-sm text-gray-500", children: "Software-based daily clocking, shifts, and audited corrections" })] }) }), _jsxs("div", { className: "flex flex-wrap gap-4 items-center bg-gray-50 p-3 rounded-lg border border-gray-200 text-sm", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "font-semibold text-gray-700", children: "Date:" }), _jsx("input", { type: "date", value: selectedDate, onChange: (e) => setSelectedDate(e.target.value), className: "px-3 py-1.5 border rounded-md bg-white focus:ring-1 focus:ring-emerald-500" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "font-semibold text-gray-700", children: "Status:" }), _jsxs("select", { value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), className: "px-3 py-1.5 border rounded-md bg-white", children: [_jsx("option", { value: "", children: "All Statuses" }), _jsx("option", { value: AttendanceStatus.PRESENT, children: "Present" }), _jsx("option", { value: AttendanceStatus.ABSENT, children: "Absent" }), _jsx("option", { value: AttendanceStatus.HALF_DAY, children: "Half Day" }), _jsx("option", { value: AttendanceStatus.ON_LEAVE, children: "On Leave" }), _jsx("option", { value: AttendanceStatus.HOLIDAY, children: "Holiday" }), _jsx("option", { value: AttendanceStatus.WEEK_OFF, children: "Week Off" })] })] }), shifts.length > 0 && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "font-semibold text-gray-700", children: "Shift:" }), _jsxs("select", { value: shiftFilter, onChange: (e) => setShiftFilter(e.target.value), className: "px-3 py-1.5 border rounded-md bg-white", children: [_jsx("option", { value: "", children: "All Shifts" }), shifts.map((s) => (_jsxs("option", { value: s.code, children: [s.name, " (", s.code, ")"] }, s.id)))] })] })), _jsx("button", { onClick: fetchAttendance, className: "ml-auto px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-semibold text-xs", children: "\uD83D\uDD04 Refresh" })] }), error && (_jsx("div", { className: "p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg", children: error })), _jsx("div", { className: "bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden", children: loading ? (_jsx("div", { className: "p-8 text-center text-gray-500", children: "Loading attendance data..." })) : displayedRecords.length === 0 ? (_jsx("div", { className: "p-8 text-center text-gray-500", children: "No attendance records found for this date." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left border-collapse text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-xs", children: [_jsx("th", { className: "p-3", children: "Employee" }), _jsx("th", { className: "p-3", children: "Shift" }), _jsx("th", { className: "p-3", children: "Check In" }), _jsx("th", { className: "p-3", children: "Check Out" }), _jsx("th", { className: "p-3", children: "Total Hours" }), _jsx("th", { className: "p-3", children: "Status" }), _jsx("th", { className: "p-3", children: "Audit Flags" }), _jsx("th", { className: "p-3 text-right", children: "Correction" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-100", children: displayedRecords.map((rec) => (_jsxs("tr", { className: "hover:bg-gray-50 transition", children: [_jsxs("td", { className: "p-3 font-semibold text-gray-900", children: [_jsx("div", { children: rec.employeeName || 'Employee' }), _jsx("div", { className: "text-xs text-gray-400 font-mono", children: rec.employeeCode })] }), _jsx("td", { className: "p-3", children: _jsx("span", { className: "px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-md font-medium", children: rec.shiftType }) }), _jsx("td", { className: "p-3 text-xs text-gray-700", children: rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' }), _jsx("td", { className: "p-3 text-xs text-gray-700", children: rec.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' }), _jsxs("td", { className: "p-3 font-mono font-semibold text-gray-800", children: [rec.totalHours.toFixed(2), "h"] }), _jsx("td", { className: "p-3", children: _jsx("span", { className: `px-2 py-0.5 text-xs font-semibold rounded-full ${rec.status === AttendanceStatus.PRESENT
                                                    ? 'bg-green-100 text-green-800'
                                                    : rec.status === AttendanceStatus.HALF_DAY
                                                        ? 'bg-amber-100 text-amber-800'
                                                        : rec.status === AttendanceStatus.ON_LEAVE
                                                            ? 'bg-blue-100 text-blue-800'
                                                            : 'bg-red-100 text-red-800'}`, children: rec.status }) }), _jsxs("td", { className: "p-3 text-xs space-y-0.5", children: [rec.isManualCorrection && (_jsx("span", { className: "inline-block px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded font-bold mr-1", children: "\u270F\uFE0F Corrected" })), rec.isLateArrival && (_jsx("span", { className: "inline-block px-1.5 py-0.5 bg-red-50 text-red-600 rounded", children: "Late" })), rec.overtimeHours > 0 && (_jsxs("span", { className: "inline-block px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded", children: ["+", rec.overtimeHours, "h OT"] }))] }), _jsx("td", { className: "p-3 text-right", children: _jsx("button", { onClick: () => {
                                                    setSelectedAttendance(rec);
                                                    setCorrectionStatus(rec.status);
                                                    setCorrectionOvertime(rec.overtimeHours);
                                                }, className: "px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium shadow-sm", children: "Correct" }) })] }, rec.id))) })] }) })) }), selectedAttendance && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4", children: _jsxs("div", { className: "bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4", children: [_jsx("h3", { className: "font-bold text-gray-800 text-lg", children: "\uD83D\uDCDD Authorize Attendance Correction" }), _jsx("p", { className: "text-xs text-gray-500", children: "Manual adjustments require an audit trail reason as per DFarm P16 policy." }), _jsxs("form", { onSubmit: handleCorrectionSubmit, className: "space-y-4 text-sm", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Corrected Status" }), _jsxs("select", { value: correctionStatus, onChange: (e) => setCorrectionStatus(e.target.value), className: "w-full mt-1 px-3 py-2 border rounded-md bg-white", children: [_jsx("option", { value: AttendanceStatus.PRESENT, children: "PRESENT (Full Day)" }), _jsx("option", { value: AttendanceStatus.HALF_DAY, children: "HALF DAY" }), _jsx("option", { value: AttendanceStatus.ABSENT, children: "ABSENT" }), _jsx("option", { value: AttendanceStatus.ON_LEAVE, children: "ON LEAVE" }), _jsx("option", { value: AttendanceStatus.HOLIDAY, children: "HOLIDAY" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Overtime Hours" }), _jsx("input", { type: "number", min: "0", max: "24", step: "0.5", value: correctionOvertime, onChange: (e) => setCorrectionOvertime(parseFloat(e.target.value) || 0), className: "w-full mt-1 px-3 py-1.5 border rounded-md" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-semibold text-gray-600 uppercase", children: "Mandatory Reason (min 5 chars) *" }), _jsx("textarea", { required: true, minLength: 5, rows: 3, placeholder: "e.g. Center electricity outage prevented software check-in", value: correctionReason, onChange: (e) => setCorrectionReason(e.target.value), className: "w-full mt-1 px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500" })] }), _jsxs("div", { className: "flex justify-end space-x-2 pt-2 border-t", children: [_jsx("button", { type: "button", onClick: () => setSelectedAttendance(null), className: "px-3 py-1.5 border rounded text-gray-600", children: "Cancel" }), _jsx("button", { type: "submit", disabled: correctionLoading, className: "px-4 py-1.5 bg-emerald-600 text-white rounded font-semibold hover:bg-emerald-700 disabled:opacity-50", children: correctionLoading ? 'Saving...' : 'Apply Correction' })] })] })] }) }))] }));
};
//# sourceMappingURL=AttendanceManagement.js.map