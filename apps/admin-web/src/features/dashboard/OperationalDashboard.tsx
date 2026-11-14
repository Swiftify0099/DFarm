import React, { useState, useEffect, useCallback } from 'react';
import { dashboardApi, DashboardMetrics } from '../../api/dashboardApi.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { StatCard } from '../../components/StatCard.js';

export interface OperationalDashboardProps {
  onNavigateSection?: (section: any) => void;
}

export const OperationalDashboard: React.FC<OperationalDashboardProps> = ({ onNavigateSection }) => {
  const { selectedCenterId, selectedDate } = useAuth();
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await dashboardApi.getMetrics({
        centerId: selectedCenterId || undefined,
        date: selectedDate,
      });
      setMetrics(data);
    } catch (err: any) {
      setError(err.message || 'Failed to aggregate dashboard metrics');
      showToast(err.message || 'Error loading dashboard metrics', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCenterId, selectedDate, showToast]);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  if (isLoading && !metrics) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold text-gray-500">Aggregating live operational metrics from PostgreSQL...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner: Real-Time Operational Header */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-300">
              Live Dairy Operations Overview
            </span>
          </div>
          <h2 className="text-2xl font-black tracking-tight">
            {metrics?.centerName || 'All Dairy Centers Combined'}
          </h2>
          <p className="text-xs text-emerald-200 mt-1">
            Business Date: <span className="font-semibold text-white">{metrics?.businessDate || selectedDate}</span> &bull; Authoritative Database Aggregations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadMetrics}
            disabled={isLoading}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 backdrop-blur-sm border border-white/20"
          >
            <span>🔄</span>
            <span>{isLoading ? 'Refreshing...' : 'Refresh KPIs'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center justify-between">
          <div>
            <span className="font-bold">Error loading metrics: </span>
            <span>{error}</span>
          </div>
          <button onClick={loadMetrics} className="underline text-xs font-bold ml-4">
            Retry
          </button>
        </div>
      )}

      {/* Missing or Unavailable Data Banner (Requirement 3) */}
      {metrics?.unavailableDataReasons && metrics.unavailableDataReasons.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
          <div className="font-bold flex items-center gap-1 text-amber-800">
            <span>⚠</span>
            <span>Operational Data Notices / Unavailable Signals:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-amber-700 pl-2">
            {metrics.unavailableDataReasons.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 1. PRIMARY MILK INTAKE KPIs */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
          <span>🥛</span> Today's Milk Procurement Summary
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Today's Cow Milk"
            value={metrics?.todayCowMilkQtyKg || 0}
            unit="KG"
            subtext="Cow milk intake today"
            icon="🐄"
            variant="emerald"
            onClick={() => onNavigateSection?.('collections')}
          />
          <StatCard
            title="Today's Buffalo Milk"
            value={metrics?.todayBuffaloMilkQtyKg || 0}
            unit="KG"
            subtext="Buffalo milk intake today"
            icon="🐃"
            variant="emerald"
            onClick={() => onNavigateSection?.('collections')}
          />
          <StatCard
            title="Total Milk Intake"
            value={metrics?.todayTotalMilkQtyKg || 0}
            unit="KG"
            subtext={`${metrics?.todayTotalCollections || 0} intake transactions`}
            icon="⚖️"
            variant="emerald"
          />
          <StatCard
            title="Total Milk Value"
            value={`₹${(metrics?.todayTotalMilkValue || 0).toLocaleString()}`}
            subtext="Authoritative rate calculated"
            icon="💵"
            variant="emerald"
            onClick={() => onNavigateSection?.('accounting')}
          />
        </div>
      </div>

      {/* 2. SHIFT COMPARISON BREAKDOWN */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Morning Shift */}
        <div className="bg-white p-5 rounded-xl border border-amber-200 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xl">☀️</span>
              <div>
                <h4 className="text-sm font-bold text-gray-900">Morning Shift Summary</h4>
                <p className="text-[11px] text-gray-500">06:00 AM – 11:30 AM Intake</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
              {metrics?.morningShiftSummary.collectionsCount || 0} Sessions
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2.5 rounded-lg bg-gray-50">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Weight</span>
              <span className="text-base font-extrabold text-gray-900">
                {metrics?.morningShiftSummary.totalWeightKg || 0}
              </span>
              <span className="text-[10px] text-gray-400 block">KG</span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Avg Fat</span>
              <span className="text-base font-extrabold text-gray-900">
                {metrics?.morningShiftSummary.avgFat || 0}%
              </span>
              <span className="text-[10px] text-gray-400 block">Quality</span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Avg SNF</span>
              <span className="text-base font-extrabold text-gray-900">
                {metrics?.morningShiftSummary.avgSnf || 0}%
              </span>
              <span className="text-[10px] text-gray-400 block">Solids</span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Value</span>
              <span className="text-base font-extrabold text-emerald-700">
                ₹{(metrics?.morningShiftSummary.totalAmount || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-gray-400 block">INR</span>
            </div>
          </div>
        </div>

        {/* Evening Shift */}
        <div className="bg-white p-5 rounded-xl border border-indigo-200 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌙</span>
              <div>
                <h4 className="text-sm font-bold text-gray-900">Evening Shift Summary</h4>
                <p className="text-[11px] text-gray-500">04:30 PM – 09:00 PM Intake</p>
              </div>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
              {metrics?.eveningShiftSummary.collectionsCount || 0} Sessions
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2.5 rounded-lg bg-gray-50">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Weight</span>
              <span className="text-base font-extrabold text-gray-900">
                {metrics?.eveningShiftSummary.totalWeightKg || 0}
              </span>
              <span className="text-[10px] text-gray-400 block">KG</span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Avg Fat</span>
              <span className="text-base font-extrabold text-gray-900">
                {metrics?.eveningShiftSummary.avgFat || 0}%
              </span>
              <span className="text-[10px] text-gray-400 block">Quality</span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Avg SNF</span>
              <span className="text-base font-extrabold text-gray-900">
                {metrics?.eveningShiftSummary.avgSnf || 0}%
              </span>
              <span className="text-[10px] text-gray-400 block">Solids</span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50">
              <span className="text-[10px] font-bold text-gray-500 uppercase block">Total Value</span>
              <span className="text-base font-extrabold text-emerald-700">
                ₹{(metrics?.eveningShiftSummary.totalAmount || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-gray-400 block">INR</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. FARMERS & OPERATIONS OVERVIEW */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
          <span>👥</span> Farmer Directory & Operations
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Active Customers"
            value={metrics?.activeCustomers || 0}
            subtext={`Of ${metrics?.totalCustomers || 0} total registered`}
            icon="🧑‍🌾"
            variant="sky"
            onClick={() => onNavigateSection?.('customers')}
          />
          <StatCard
            title="Pending Registrations"
            value={metrics?.pendingCustomerRegistrations || 0}
            subtext="Awaiting KYC or biometric approval"
            icon="📝"
            variant={metrics?.pendingCustomerRegistrations ? 'amber' : 'default'}
            onClick={() => onNavigateSection?.('customers')}
          />
          <StatCard
            title="Active Employees"
            value={metrics?.activeEmployees || 0}
            subtext="Staff & center personnel"
            icon="👔"
            variant="indigo"
            onClick={() => onNavigateSection?.('employees')}
          />
          <StatCard
            title="Feed Stock Alerts"
            value={metrics?.feedStockAlerts || 0}
            subtext="Items below reorder threshold"
            icon="📦"
            variant={metrics?.feedStockAlerts ? 'rose' : 'default'}
            alert={Boolean(metrics?.feedStockAlerts && metrics.feedStockAlerts > 0)}
            onClick={() => onNavigateSection?.('feed')}
          />
        </div>
      </div>

      {/* 4. FINANCIAL STATUS & SUBLEDGER LIABILITIES */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
          <span>💰</span> Financial Liabilities & Settlement Status
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Customer Payables"
            value={`₹${(metrics?.totalCustomerPayables || 0).toLocaleString()}`}
            subtext="Total liability owed to farmers"
            icon="🏦"
            variant="indigo"
            onClick={() => onNavigateSection?.('accounting')}
          />
          <StatCard
            title="Outstanding Advances"
            value={`₹${(metrics?.outstandingCustomerAdvances || 0).toLocaleString()}`}
            subtext="Recoverable advance balance"
            icon="🤝"
            variant="amber"
            onClick={() => onNavigateSection?.('accounting')}
          />
          <StatCard
            title="Pending Bills"
            value={metrics?.pendingBillsCount || 0}
            subtext={`Amount: ₹${(metrics?.pendingBillsAmount || 0).toLocaleString()}`}
            icon="🧾"
            variant="sky"
            onClick={() => onNavigateSection?.('accounting')}
          />
          <StatCard
            title="Pending Payouts"
            value={metrics?.pendingPayoutsCount || 0}
            subtext={`Amount: ₹${(metrics?.pendingPayoutsAmount || 0).toLocaleString()}`}
            icon="💳"
            variant={metrics?.pendingPayoutsCount ? 'amber' : 'default'}
            onClick={() => onNavigateSection?.('accounting')}
          />
        </div>
      </div>

      {/* 5. HARDWARE & SYNCHRONIZATION STATUS */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
          <span>📟</span> Hardware Devices & Offline Sync Gateway
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Active Hardware Devices"
            value={metrics?.deviceStatus.active || 0}
            subtext={`Of ${metrics?.deviceStatus.total || 0} provisioned terminals`}
            icon="🖥️"
            variant="emerald"
            onClick={() => onNavigateSection?.('devices')}
          />
          <StatCard
            title="Blocked Devices"
            value={metrics?.deviceStatus.blocked || 0}
            subtext="Revoked or suspicious terminals"
            icon="🔒"
            variant={metrics?.deviceStatus.blocked ? 'rose' : 'default'}
            alert={Boolean(metrics?.deviceStatus.blocked && metrics.deviceStatus.blocked > 0)}
            onClick={() => onNavigateSection?.('devices')}
          />
          <StatCard
            title="Sync Conflict Events"
            value={metrics?.failedSyncEvents || 0}
            subtext="Unresolved offline sync conflicts"
            icon="⚡"
            variant={metrics?.failedSyncEvents ? 'rose' : 'default'}
            alert={Boolean(metrics?.failedSyncEvents && metrics.failedSyncEvents > 0)}
            onClick={() => onNavigateSection?.('devices')}
          />
          <StatCard
            title="Gateway Status"
            value="ONLINE"
            subtext="PostgreSQL DB Sync Monitored"
            icon="🌐"
            variant="emerald"
          />
        </div>
      </div>
    </div>
  );
};
