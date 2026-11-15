import React, { useState, useEffect } from 'react';
import { employeeApi } from '../../api/employeeApi.js';
import {
  type EmployeeAttendance,
  type EmployeeShift,
  AttendanceStatus,
} from '@dfarm/shared-types';

export const AttendanceManagement: React.FC = () => {
  const [records, setRecords] = useState<EmployeeAttendance[]>([]);
  const [shifts, setShifts] = useState<EmployeeShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]!);
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | ''>('');
  const [shiftFilter, setShiftFilter] = useState<string>('');

  // Correction modal state
  const [selectedAttendance, setSelectedAttendance] = useState<EmployeeAttendance | null>(null);
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [correctionStatus, setCorrectionStatus] = useState<AttendanceStatus>(AttendanceStatus.PRESENT);
  const [correctionOvertime, setCorrectionOvertime] = useState<number>(0);
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
    } catch (err: any) {
      setError(err.message || 'Failed to fetch attendance');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [selectedDate, statusFilter]);

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAttendance) return;
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
    } catch (err: any) {
      alert(err.message || 'Failed to submit correction');
    } finally {
      setCorrectionLoading(false);
    }
  };

  const displayedRecords = shiftFilter
    ? records.filter((r) => r.shiftType === shiftFilter)
    : records;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="clay-card rounded-3xl p-6 bg-white shadow-clay-card border border-white/80 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">⏱️ Staff Attendance & Shifts</h2>
          <p className="text-sm text-slate-500 font-medium">Software-based daily clocking, shifts, and audited corrections</p>
        </div>
      </div>

      {/* Date & Filter Control */}
      <div className="clay-inset p-4 rounded-2xl bg-[#EEF2F6] border border-[#CBD5E1]/50 flex flex-wrap gap-4 items-center text-xs font-bold text-slate-700">
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AttendanceStatus)}
            className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
          >
            <option value="">All Statuses</option>
            <option value={AttendanceStatus.PRESENT}>Present</option>
            <option value={AttendanceStatus.ABSENT}>Absent</option>
            <option value={AttendanceStatus.HALF_DAY}>Half Day</option>
            <option value={AttendanceStatus.ON_LEAVE}>On Leave</option>
            <option value={AttendanceStatus.HOLIDAY}>Holiday</option>
            <option value={AttendanceStatus.WEEK_OFF}>Week Off</option>
          </select>
        </div>

        {shifts.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">Shift:</label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="clay-inset bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            >
              <option value="">All Shifts</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.code}>{s.name} ({s.code})</option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={fetchAttendance}
          className="ml-auto px-4 py-1.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-xs border border-slate-300 shadow-sm active:scale-95 transition-all"
        >
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm">
          {error}
        </div>
      )}

      {/* Attendance Table */}
      <div className="clay-card rounded-2xl bg-white shadow-clay-card border border-white/80 overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-slate-400 text-sm font-semibold space-y-2">
            <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div>Loading attendance data...</div>
          </div>
        ) : displayedRecords.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm font-semibold">No attendance records found for this date.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-slate-200 text-slate-600 font-extrabold uppercase text-xs tracking-wider">
                  <th className="px-4 py-3.5">Employee</th>
                  <th className="px-4 py-3.5">Shift</th>
                  <th className="px-4 py-3.5">Check In</th>
                  <th className="px-4 py-3.5">Check Out</th>
                  <th className="px-4 py-3.5">Total Hours</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Audit Flags</th>
                  <th className="px-4 py-3.5 text-right">Correction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 font-bold text-slate-900">
                      <div>{rec.employeeName || 'Employee'}</div>
                      <div className="text-xs text-slate-400 font-mono font-bold">{rec.employeeCode}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2.5 py-0.5 text-xs bg-sky-50 text-sky-700 rounded-md font-bold border border-sky-200">
                        {rec.shiftType}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-700 font-medium">
                      {rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-700 font-medium">
                      {rec.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3.5 font-mono font-black text-slate-900">
                      {rec.totalHours.toFixed(2)}h
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-block px-2.5 py-0.5 text-xs font-extrabold rounded-full ${
                        rec.status === AttendanceStatus.PRESENT
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : rec.status === AttendanceStatus.HALF_DAY
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : rec.status === AttendanceStatus.ON_LEAVE
                          ? 'bg-sky-100 text-sky-800 border border-sky-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {rec.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs space-y-0.5">
                      {rec.isManualCorrection && (
                        <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md font-extrabold mr-1 border border-amber-200">
                          ✏️ Corrected
                        </span>
                      )}
                      {rec.isLateArrival && (
                        <span className="inline-block px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md font-bold border border-rose-200">Late</span>
                      )}
                      {rec.overtimeHours > 0 && (
                        <span className="inline-block px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md font-bold border border-purple-200">
                          +{rec.overtimeHours}h OT
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => {
                          setSelectedAttendance(rec);
                          setCorrectionStatus(rec.status);
                          setCorrectionOvertime(rec.overtimeHours);
                        }}
                        className="px-3 py-1.5 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold shadow-sm active:scale-95 transition-all"
                      >
                        Correct
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manual Correction Modal */}
      {selectedAttendance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-white">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-black text-slate-800 text-lg">📝 Authorize Attendance Correction</h3>
              <button
                onClick={() => setSelectedAttendance(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl"
              >
                &times;
              </button>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Manual adjustments require an audit trail reason as per DFarm P16 policy.
            </p>

            <form onSubmit={handleCorrectionSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Corrected Status</label>
                <select
                  value={correctionStatus}
                  onChange={(e) => setCorrectionStatus(e.target.value as AttendanceStatus)}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                >
                  <option value={AttendanceStatus.PRESENT}>PRESENT (Full Day)</option>
                  <option value={AttendanceStatus.HALF_DAY}>HALF DAY</option>
                  <option value={AttendanceStatus.ABSENT}>ABSENT</option>
                  <option value={AttendanceStatus.ON_LEAVE}>ON LEAVE</option>
                  <option value={AttendanceStatus.HOLIDAY}>HOLIDAY</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Overtime Hours</label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={correctionOvertime}
                  onChange={(e) => setCorrectionOvertime(parseFloat(e.target.value) || 0)}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Mandatory Reason (min 5 chars) *</label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  placeholder="e.g. Center electricity outage prevented software check-in"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedAttendance(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={correctionLoading}
                  className="clay-btn-brand px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-extrabold shadow-clay-button disabled:opacity-50 active:scale-95 transition-all"
                >
                  {correctionLoading ? 'Saving...' : 'Apply Correction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
