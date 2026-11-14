import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';

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
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="pb-2 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">⚙️ Center & Operational Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Dairy center configurations, shift operational windows, and staff account security.
        </p>
      </div>

      {/* Grid: 2 columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Centers Overview */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider">
            🏛️ Dairy Centers & Branches
          </h2>
          <div className="space-y-3">
            {centers.map((c) => (
              <div
                key={c.id}
                className={`p-3 rounded-lg border ${
                  c.id === currentCenterId
                    ? 'border-emerald-500 bg-emerald-50/30'
                    : 'border-gray-200 bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-900 text-sm">{c.name}</span>
                  <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600">
                    {c.code}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Center ID: <span className="font-mono">{c.id}</span>
                </div>
                {c.id === currentCenterId && (
                  <span className="inline-block mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    ACTIVE SELECTED CENTER
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* User Account Details */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider">
            👤 Staff Profile & Session
          </h2>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">Staff Name:</span>
              <span className="font-semibold text-gray-900">{user?.fullName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Username / Phone:</span>
              <span className="font-mono text-gray-900">{user?.username || user?.phoneNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Assigned Role:</span>
              <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {user?.role}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Organization ID:</span>
              <span className="font-mono text-gray-600">{user?.organizationId}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Shift & Measurement Configuration */}
      <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
        <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wider">
          ⏱️ Shift Timings & Weighing Units
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-amber-800 uppercase">Morning Shift Window</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Open Time</label>
                <input
                  type="time"
                  value={morningStart}
                  onChange={(e) => setMorningStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Close Time</label>
                <input
                  type="time"
                  value={morningEnd}
                  onChange={(e) => setMorningEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-indigo-800 uppercase">Evening Shift Window</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Open Time</label>
                <input
                  type="time"
                  value={eveningStart}
                  onChange={(e) => setEveningStart(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Close Time</label>
                <input
                  type="time"
                  value={eveningEnd}
                  onChange={(e) => setEveningEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Primary Milk Measurement Unit</label>
            <select
              value={measurementUnit}
              onChange={(e) => setMeasurementUnit(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-medium text-gray-800"
            >
              <option value="KG">Kilograms (Kg) — Default Dairy Mass</option>
              <option value="LITER">Liters (L) — Volumetric Measurement</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Operational Business Date Override</label>
            <input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white font-medium text-gray-800"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
          >
            Save Configuration
          </button>
        </div>
      </form>
    </div>
  );
};
