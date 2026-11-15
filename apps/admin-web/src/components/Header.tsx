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
    <header className="h-18 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-10 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] select-none">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3.5">
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden w-10 h-10 rounded-xl bg-[#EDF2F7] border border-slate-200/90 shadow-[0_2px_5px_rgba(0,0,0,0.05),inset_0_1px_1px_rgba(255,255,255,0.9)] flex items-center justify-center text-slate-700 hover:text-slate-900 active:scale-95 transition"
        >
          <span className="text-base font-bold">☰</span>
        </button>
        <div>
          <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>{activeSectionTitle}</span>
          </h1>
        </div>
      </div>

      {/* Right: Operational Controls */}
      <div className="flex items-center gap-2 sm:gap-3.5">
        {/* Center Selector Dropdown */}
        <div className="hidden md:flex items-center gap-1.5 bg-[#EDF2F7] p-1 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05),inset_-1.5px_-1.5px_3px_rgba(255,255,255,0.85)]">
          <span className="text-[10px] font-extrabold text-slate-500 uppercase px-2">Center:</span>
          <select
            value={selectedCenterId}
            onChange={(e) => setSelectedCenterId(e.target.value)}
            className="text-xs font-bold bg-white text-slate-800 rounded-lg px-2.5 py-1.5 border border-white/80 shadow-[0_2px_4px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.9)] focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
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
        <div className="flex items-center bg-[#EDF2F7] p-1 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05),inset_-1.5px_-1.5px_3px_rgba(255,255,255,0.85)] text-xs font-extrabold">
          <button
            onClick={() => setSelectedShift('MORNING')}
            className={`px-3 py-1.5 rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
              selectedShift === 'MORNING'
                ? 'bg-amber-400 text-amber-950 font-black shadow-[0_3px_8px_rgba(245,158,11,0.35),inset_0_1px_1px_rgba(255,255,255,0.5)] transform -translate-y-0.5'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>☀️</span>
            <span className="hidden sm:inline">Morning</span>
          </button>
          <button
            onClick={() => setSelectedShift('EVENING')}
            className={`px-3 py-1.5 rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
              selectedShift === 'EVENING'
                ? 'bg-[#00506E] text-white font-black shadow-[0_3px_8px_rgba(0,80,110,0.35),inset_0_1px_1px_rgba(255,255,255,0.4)] transform -translate-y-0.5'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🌙</span>
            <span className="hidden sm:inline">Evening</span>
          </button>
        </div>

        {/* Date Selector */}
        <div className="hidden lg:flex items-center bg-[#EDF2F7] p-1 rounded-xl border border-slate-200/80 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05),inset_-1.5px_-1.5px_3px_rgba(255,255,255,0.85)]">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs font-bold bg-white text-slate-800 rounded-lg px-2.5 py-1.5 border border-white/80 shadow-[0_2px_4px_rgba(0,0,0,0.04),inset_0_1px_1px_rgba(255,255,255,0.9)] focus:outline-none focus:ring-2 focus:ring-[#00506E] cursor-pointer"
          />
        </div>

        {/* User Pill & Logout */}
        <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-slate-200/90">
          <div className="hidden xl:block text-right">
            <span className="block text-xs font-black text-slate-900">{user?.fullName || 'Staff'}</span>
            <span className="block text-[10px] font-extrabold text-[#00506E] uppercase tracking-wider">
              {user?.role?.replace(/_/g, ' ')}
            </span>
          </div>

          <button
            onClick={logout}
            title="Log out of session"
            className="px-3 py-1.5 text-xs text-rose-700 bg-white hover:bg-rose-50 border border-rose-200/90 rounded-xl font-bold shadow-[0_2px_6px_rgba(225,29,72,0.1),inset_0_1px_1px_rgba(255,255,255,0.9)] transition-all duration-150 active:translate-y-0.5 flex items-center gap-1.5"
          >
            <span>🚪</span>
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};
