import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { ClayButton } from '../../components/ClayButton.js';

export const SettingsModule: React.FC = () => {
  const { user, centers, currentCenterId, businessDate, setBusinessDate } = useAuth();
  const { showToast } = useToast();

  const [morningStart, setMorningStart] = useState('06:00');
  const [morningEnd, setMorningEnd] = useState('10:00');
  const [eveningStart, setEveningStart] = useState('17:00');
  const [eveningEnd, setEveningEnd] = useState('21:00');
  const [measurementUnit, setMeasurementUnit] = useState('KG');

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    showToast('Operating preferences saved successfully!', 'success');
  };

  return (
    <div className="space-y-6 max-w-5xl select-none">
      {/* Header */}
      <div className="pb-3 border-b border-slate-200/80">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <span>⚙️</span>
          <span>Center & Operational Settings</span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
          Dairy center configurations, shift operational windows, and staff account security.
        </p>
      </div>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Centers Overview */}
        <div className="clay-surface p-5 sm:p-6 space-y-4">
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <span>🏛️</span>
            <span>Dairy Centers & Branches</span>
          </h2>
          <div className="space-y-3">
            {centers.map((c) => (
              <div
                key={c.id}
                className={`p-3.5 rounded-2xl border transition-all duration-150 ${
                  c.id === currentCenterId
                    ? 'border-[#23759B]/60 bg-[#E6F4FA] shadow-[0_4px_12px_rgba(0,80,110,0.1),inset_0_1.5px_2px_rgba(255,255,255,0.95)]'
                    : 'border-slate-200/80 bg-[#F8FAFC]'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-black text-slate-900 text-sm">{c.name}</span>
                  <span className="text-xs font-mono font-bold bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 text-slate-700 shadow-sm">
                    {c.code}
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1.5">
                  Center ID: <span className="font-mono text-slate-700">{c.id}</span>
                </div>
                {c.id === currentCenterId && (
                  <span className="inline-block mt-2.5 text-[10px] font-black text-[#137333] bg-[#E6F4EA] border border-emerald-300 px-2.5 py-0.5 rounded-full shadow-sm">
                    ACTIVE SELECTED CENTER
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* User Account Details */}
        <div className="clay-surface p-5 sm:p-6 space-y-4">
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <span>👤</span>
            <span>Staff Profile & Session</span>
          </h2>
          <div className="bg-[#F8FAFC] p-4 sm:p-5 rounded-2xl border border-slate-200/80 space-y-3 text-xs shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] font-semibold">
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Staff Name:</span>
              <span className="font-black text-slate-900">{user?.fullName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Username / Phone:</span>
              <span className="font-mono text-slate-800 font-bold">{user?.username || user?.phoneNumber}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Assigned Role:</span>
              <span className="font-black text-[#00506E] bg-[#E6F4FA] px-2.5 py-0.5 rounded-full border border-sky-200">
                {user?.role}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500 font-medium">Organization ID:</span>
              <span className="font-mono text-slate-600 font-bold">{user?.organizationId}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Shift & Measurement Configuration */}
      <form onSubmit={handleSaveSettings} className="clay-surface p-6 sm:p-8 space-y-6">
        <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
          <span>⏱️</span>
          <span>Shift Timings & Weighing Units</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-xs font-black text-[#B06000] uppercase tracking-wider">Morning Shift Window</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Open Time</label>
                <input
                  type="time"
                  value={morningStart}
                  onChange={(e) => setMorningStart(e.target.value)}
                  className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Close Time</label>
                <input
                  type="time"
                  value={morningEnd}
                  onChange={(e) => setMorningEnd(e.target.value)}
                  className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-black text-[#1A73E8] uppercase tracking-wider">Evening Shift Window</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Open Time</label>
                <input
                  type="time"
                  value={eveningStart}
                  onChange={(e) => setEveningStart(e.target.value)}
                  className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Close Time</label>
                <input
                  type="time"
                  value={eveningEnd}
                  onChange={(e) => setEveningEnd(e.target.value)}
                  className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-center text-xs">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1.5">Primary Milk Measurement Unit</label>
            <select
              value={measurementUnit}
              onChange={(e) => setMeasurementUnit(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
            >
              <option value="KG">Kilograms (Kg) — Default Dairy Mass</option>
              <option value="LITER">Liters (L) — Volumetric Measurement</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1.5">Operational Business Date Override</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
            />
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-slate-100">
          <ClayButton
            type="submit"
            variant="brand"
            size="md"
          >
            Save Configuration
          </ClayButton>
        </div>
      </form>
    </div>
  );
};
