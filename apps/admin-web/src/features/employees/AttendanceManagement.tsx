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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-800">⏱️ Staff Attendance & Shifts</h2>
          <p className="text-sm text-gray-500">Software-based daily clocking, shifts, and audited corrections</p>
        </div>
      </div>

      {/* Date & Filter Control */}
      <div className="flex flex-wrap gap-4 items-center bg-gray-50 p-3 rounded-lg border border-gray-200 text-sm">
        <div className="flex items-center gap-2">
          <label className="font-semibold text-gray-700">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 border rounded-md bg-white focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="font-semibold text-gray-700">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as AttendanceStatus)}
            className="px-3 py-1.5 border rounded-md bg-white"
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
            <label className="font-semibold text-gray-700">Shift:</label>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="px-3 py-1.5 border rounded-md bg-white"
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
          className="ml-auto px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-semibold text-xs"
        >
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Attendance Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading attendance data...</div>
        ) : displayedRecords.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No attendance records found for this date.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase text-xs">
                  <th className="p-3">Employee</th>
                  <th className="p-3">Shift</th>
                  <th className="p-3">Check In</th>
                  <th className="p-3">Check Out</th>
                  <th className="p-3">Total Hours</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Audit Flags</th>
                  <th className="p-3 text-right">Correction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50 transition">
                    <td className="p-3 font-semibold text-gray-900">
                      <div>{rec.employeeName || 'Employee'}</div>
                      <div className="text-xs text-gray-400 font-mono">{rec.employeeCode}</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-md font-medium">
                        {rec.shiftType}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-700">
                      {rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="p-3 text-xs text-gray-700">
                      {rec.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="p-3 font-mono font-semibold text-gray-800">
                      {rec.totalHours.toFixed(2)}h
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                        rec.status === AttendanceStatus.PRESENT
                          ? 'bg-green-100 text-green-800'
                          : rec.status === AttendanceStatus.HALF_DAY
                          ? 'bg-amber-100 text-amber-800'
                          : rec.status === AttendanceStatus.ON_LEAVE
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {rec.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs space-y-0.5">
                      {rec.isManualCorrection && (
                        <span className="inline-block px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded font-bold mr-1">
                          ✏️ Corrected
                        </span>
                      )}
                      {rec.isLateArrival && (
                        <span className="inline-block px-1.5 py-0.5 bg-red-50 text-red-600 rounded">Late</span>
                      )}
                      {rec.overtimeHours > 0 && (
                        <span className="inline-block px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded">
                          +{rec.overtimeHours}h OT
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedAttendance(rec);
                          setCorrectionStatus(rec.status);
                          setCorrectionOvertime(rec.overtimeHours);
                        }}
                        className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium shadow-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-gray-800 text-lg">📝 Authorize Attendance Correction</h3>
            <p className="text-xs text-gray-500">
              Manual adjustments require an audit trail reason as per DFarm P16 policy.
            </p>

            <form onSubmit={handleCorrectionSubmit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Corrected Status</label>
                <select
                  value={correctionStatus}
                  onChange={(e) => setCorrectionStatus(e.target.value as AttendanceStatus)}
                  className="w-full mt-1 px-3 py-2 border rounded-md bg-white"
                >
                  <option value={AttendanceStatus.PRESENT}>PRESENT (Full Day)</option>
                  <option value={AttendanceStatus.HALF_DAY}>HALF DAY</option>
                  <option value={AttendanceStatus.ABSENT}>ABSENT</option>
                  <option value={AttendanceStatus.ON_LEAVE}>ON LEAVE</option>
                  <option value={AttendanceStatus.HOLIDAY}>HOLIDAY</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Overtime Hours</label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={correctionOvertime}
                  onChange={(e) => setCorrectionOvertime(parseFloat(e.target.value) || 0)}
                  className="w-full mt-1 px-3 py-1.5 border rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase">Mandatory Reason (min 5 chars) *</label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  placeholder="e.g. Center electricity outage prevented software check-in"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-md focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedAttendance(null)}
                  className="px-3 py-1.5 border rounded text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={correctionLoading}
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded font-semibold hover:bg-emerald-700 disabled:opacity-50"
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
