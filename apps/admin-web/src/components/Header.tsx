import React from 'react';
import { useAuth } from '../context/AuthContext.js';

export interface HeaderProps {
  onToggleMobileSidebar: () => void;
  activeSectionTitle: string;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileSidebar, activeSectionTitle }) => {
  const {
    user,
    centers,
    selectedCenterId,
    setSelectedCenterId,
    selectedShift,
    setSelectedShift,
    selectedDate,
    setSelectedDate,
    logout,
  } = useAuth();

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-10 shadow-sm">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 focus:outline-none"
        >
          ☰
        </button>
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight">
            {activeSectionTitle}
          </h1>
        </div>
      </div>

      {/* Right: Operational Controls */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Center Selector Dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="hidden md:inline text-xs font-bold text-gray-500 uppercase">Center:</span>
          <select
            value={selectedCenterId}
            onChange={(e) => setSelectedCenterId(e.target.value)}
            className="text-xs font-semibold bg-gray-50 border border-gray-300 text-gray-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All Intake Centers</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Shift Toggle */}
        <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-xs font-bold">
          <button
            onClick={() => setSelectedShift('MORNING')}
            className={`px-2.5 py-1 rounded-md transition ${
              selectedShift === 'MORNING'
                ? 'bg-amber-400 text-amber-950 shadow-sm font-extrabold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            ☀️ Morning
          </button>
          <button
            onClick={() => setSelectedShift('EVENING')}
            className={`px-2.5 py-1 rounded-md transition ${
              selectedShift === 'EVENING'
                ? 'bg-indigo-600 text-white shadow-sm font-extrabold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            🌙 Evening
          </button>
        </div>

        {/* Date Selector */}
        <div className="hidden sm:flex items-center">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs font-medium bg-gray-50 border border-gray-300 text-gray-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* User Pill & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
          <div className="hidden xl:block text-right">
            <span className="block text-xs font-bold text-gray-800">{user?.fullName || 'Staff'}</span>
            <span className="block text-[10px] font-semibold text-emerald-700 uppercase">
              {user?.role?.replace(/_/g, ' ')}
            </span>
          </div>

          <button
            onClick={logout}
            title="Log out of session"
            className="p-1.5 text-xs text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg font-bold transition flex items-center gap-1"
          >
            <span>🚪</span>
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};
