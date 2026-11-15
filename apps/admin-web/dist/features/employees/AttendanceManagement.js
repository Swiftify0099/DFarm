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
    return (_jsxs("div", { className: "space-y-6", children: [_jsx("div", { className: "clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4", children: _jsxs("div", { children: [_jsx("h2", { className: "text-2xl font-black text-slate-800 tracking-tight", children: "\u23F1\uFE0F Staff Attendance & Shifts" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Software-based daily clocking, shifts, and audited corrections" })] }) }), _jsxs("div", { className: "clay-inset p-4 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 flex flex-wrap gap-4 items-center text-xs font-bold text-slate-700", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-[11px] font-extrabold uppercase tracking-wider text-slate-600", children: "Date:" }), _jsx("input", { type: "date", value: selectedDate, onChange: (e) => setSelectedDate(e.target.value), className: "clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-[11px] font-extrabold uppercase tracking-wider text-slate-600", children: "Status:" }), _jsxs("select", { value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), className: "clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: [_jsx("option", { value: "", children: "All Statuses" }), _jsx("option", { value: AttendanceStatus.PRESENT, children: "Present" }), _jsx("option", { value: AttendanceStatus.ABSENT, children: "Absent" }), _jsx("option", { value: AttendanceStatus.HALF_DAY, children: "Half Day" }), _jsx("option", { value: AttendanceStatus.ON_LEAVE, children: "On Leave" }), _jsx("option", { value: AttendanceStatus.HOLIDAY, children: "Holiday" }), _jsx("option", { value: AttendanceStatus.WEEK_OFF, children: "Week Off" })] })] }), shifts.length > 0 && (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("label", { className: "text-[11px] font-extrabold uppercase tracking-wider text-slate-600", children: "Shift:" }), _jsxs("select", { value: shiftFilter, onChange: (e) => setShiftFilter(e.target.value), className: "clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: [_jsx("option", { value: "", children: "All Shifts" }), shifts.map((s) => (_jsxs("option", { value: s.code, children: [s.name, " (", s.code, ")"] }, s.id)))] })] })), _jsx("button", { onClick: fetchAttendance, className: "ml-auto px-4 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-xs border border-slate-300 shadow-sm active:scale-95 transition-all", children: "\uD83D\uDD04 Refresh" })] }), error && (_jsx("div", { className: "p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm", children: error })), _jsx("div", { className: "clay-card rounded-2xl bg-white shadow-clay-card border border-white/80 overflow-hidden", children: loading ? (_jsxs("div", { className: "text-center py-16 text-slate-400 text-sm font-semibold space-y-2", children: [_jsx("div", { className: "w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("div", { children: "Loading attendance data..." })] })) : displayedRecords.length === 0 ? (_jsx("div", { className: "text-center py-16 text-slate-500 text-sm font-semibold", children: "No attendance records found for this date." })) : (_jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left border-collapse text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-extrabold uppercase text-xs tracking-wider", children: [_jsx("th", { className: "px-4 py-3.5", children: "Employee" }), _jsx("th", { className: "px-4 py-3.5", children: "Shift" }), _jsx("th", { className: "px-4 py-3.5", children: "Check In" }), _jsx("th", { className: "px-4 py-3.5", children: "Check Out" }), _jsx("th", { className: "px-4 py-3.5", children: "Total Hours" }), _jsx("th", { className: "px-4 py-3.5", children: "Status" }), _jsx("th", { className: "px-4 py-3.5", children: "Audit Flags" }), _jsx("th", { className: "px-4 py-3.5 text-right", children: "Correction" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100", children: displayedRecords.map((rec) => (_jsxs("tr", { className: "hover:bg-slate-50/80 transition-colors", children: [_jsxs("td", { className: "px-4 py-3.5 font-bold text-slate-900", children: [_jsx("div", { children: rec.employeeName || 'Employee' }), _jsx("div", { className: "text-xs text-slate-400 font-mono font-bold", children: rec.employeeCode })] }), _jsx("td", { className: "px-4 py-3.5", children: _jsx("span", { className: "px-2.5 py-0.5 text-xs bg-sky-50 text-sky-700 rounded-md font-bold border border-sky-200", children: rec.shiftType }) }), _jsx("td", { className: "px-4 py-3.5 text-xs text-slate-700 font-medium", children: rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' }), _jsx("td", { className: "px-4 py-3.5 text-xs text-slate-700 font-medium", children: rec.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—' }), _jsxs("td", { className: "px-4 py-3.5 font-mono font-black text-slate-900", children: [rec.totalHours.toFixed(2), "h"] }), _jsx("td", { className: "px-4 py-3.5", children: _jsx("span", { className: `inline-block px-2.5 py-0.5 text-xs font-extrabold rounded-full ${rec.status === AttendanceStatus.PRESENT
                                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                                    : rec.status === AttendanceStatus.HALF_DAY
                                                        ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                                        : rec.status === AttendanceStatus.ON_LEAVE
                                                            ? 'bg-sky-100 text-sky-800 border border-sky-200'
                                                            : 'bg-rose-100 text-rose-800 border border-rose-200'}`, children: rec.status }) }), _jsxs("td", { className: "px-4 py-3.5 text-xs space-y-0.5", children: [rec.isManualCorrection && (_jsx("span", { className: "inline-block px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md font-extrabold mr-1 border border-amber-200", children: "\u270F\uFE0F Corrected" })), rec.isLateArrival && (_jsx("span", { className: "inline-block px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md font-bold border border-rose-200", children: "Late" })), rec.overtimeHours > 0 && (_jsxs("span", { className: "inline-block px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md font-bold border border-purple-200", children: ["+", rec.overtimeHours, "h OT"] }))] }), _jsx("td", { className: "px-4 py-3.5 text-right", children: _jsx("button", { onClick: () => {
                                                    setSelectedAttendance(rec);
                                                    setCorrectionStatus(rec.status);
                                                    setCorrectionOvertime(rec.overtimeHours);
                                                }, className: "px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold shadow-sm active:scale-95 transition-all", children: "Correct" }) })] }, rec.id))) })] }) })) }), selectedAttendance && (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200", children: _jsxs("div", { className: "clay-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-white", children: [_jsxs("div", { className: "flex justify-between items-center border-b pb-2", children: [_jsx("h3", { className: "font-black text-slate-800 text-lg", children: "\uD83D\uDCDD Authorize Attendance Correction" }), _jsx("button", { onClick: () => setSelectedAttendance(null), className: "text-slate-400 hover:text-slate-600 font-bold text-xl", children: "\u00D7" })] }), _jsx("p", { className: "text-xs text-slate-500 font-medium", children: "Manual adjustments require an audit trail reason as per DFarm P16 policy." }), _jsxs("form", { onSubmit: handleCorrectionSubmit, className: "space-y-4 text-sm", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Corrected Status" }), _jsxs("select", { value: correctionStatus, onChange: (e) => setCorrectionStatus(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm", children: [_jsx("option", { value: AttendanceStatus.PRESENT, children: "PRESENT (Full Day)" }), _jsx("option", { value: AttendanceStatus.HALF_DAY, children: "HALF DAY" }), _jsx("option", { value: AttendanceStatus.ABSENT, children: "ABSENT" }), _jsx("option", { value: AttendanceStatus.ON_LEAVE, children: "ON LEAVE" }), _jsx("option", { value: AttendanceStatus.HOLIDAY, children: "HOLIDAY" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Overtime Hours" }), _jsx("input", { type: "number", min: "0", max: "24", step: "0.5", value: correctionOvertime, onChange: (e) => setCorrectionOvertime(parseFloat(e.target.value) || 0), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1", children: "Mandatory Reason (min 5 chars) *" }), _jsx("textarea", { required: true, minLength: 5, rows: 3, placeholder: "e.g. Center electricity outage prevented software check-in", value: correctionReason, onChange: (e) => setCorrectionReason(e.target.value), className: "w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" })] }), _jsxs("div", { className: "flex justify-end space-x-2 pt-3 border-t border-slate-100", children: [_jsx("button", { type: "button", onClick: () => setSelectedAttendance(null), className: "px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all", children: "Cancel" }), _jsx("button", { type: "submit", disabled: correctionLoading, className: "clay-btn-brand px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-extrabold shadow-clay-button disabled:opacity-50 active:scale-95 transition-all", children: correctionLoading ? 'Saving...' : 'Apply Correction' })] })] })] }) }))] }));
};
//# sourceMappingURL=AttendanceManagement.js.map