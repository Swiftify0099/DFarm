import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import { useNavigate } from 'react-router-dom'
import {
  ClayCard,
  ClayStatCard,
  ClayButton,
  ClayBadge,
  ClayAlert,
} from '@/components/ui'
import {
  MilkCanVisual,
  CowVisual,
  BuffaloVisual,
  FaceBiometricVisual,
  IotMachineVisual,
  LedgerShieldVisual,
} from '@/assets/illustrations'
import {
  Users,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertCircle,
  FileText,
  DollarSign,
  Package,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts'

export const Dashboard: React.FC = () => {
  const navigate = useNavigate()

  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboardSummary'],
    queryFn: () => api.dashboard.getSummary(),
    refetchInterval: 30000,
  })

  // Sample weekly collection volume data (Liters)
  const collectionTrendsData = [
    { day: 'Mon', cow: 320, buffalo: 180, total: 500 },
    { day: 'Tue', cow: 335, buffalo: 190, total: 525 },
    { day: 'Wed', cow: 310, buffalo: 175, total: 485 },
    { day: 'Thu', cow: 345, buffalo: 195, total: 540 },
    { day: 'Fri', cow: 330, buffalo: 185, total: 515 },
    { day: 'Sat', cow: 340, buffalo: 190, total: 530 },
    { day: 'Sun (Today)', cow: 340.5, buffalo: 197.5, total: 538 },
  ]

  // Fat & SNF distribution trends
  const qualityTrendData = [
    { time: '06:00', fat: 4.2, snf: 8.7 },
    { time: '06:30', fat: 4.3, snf: 8.8 },
    { time: '07:00', fat: 4.1, snf: 8.6 },
    { time: '07:30', fat: 4.4, snf: 8.9 },
    { time: '08:00', fat: 4.2, snf: 8.7 },
    { time: '08:30', fat: 4.5, snf: 8.8 },
  ]

  if (isLoading || !summary) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-[#817A75]">
        <div className="w-10 h-10 border-4 border-[#FF6A00] border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm font-semibold">Loading real-time dairy operational metrics...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 text-left">
      {/* Top Banner: Dairy Profile & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-gradient-to-r from-white via-[#FFF5EE] to-[#FFE9DC]/50 rounded-2xl border border-[#F1E7E0] shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">
              {summary.dairyProfile.name}
            </h1>
            <ClayBadge variant="cow" className="text-xs">
              {summary.dairyProfile.code}
            </ClayBadge>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Tenant Isolated Management Node • Tier:{' '}
            <span className="font-bold text-[#211B18]">{summary.dairyProfile.subscription}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <ClayButton
            variant="secondary"
            size="sm"
            onClick={() => navigate('/collection/sessions')}
            leftIcon={<Clock size={16} />}
          >
            Live Sessions
          </ClayButton>
          <ClayButton
            variant="primary"
            size="sm"
            onClick={() => navigate('/customers/approvals')}
            leftIcon={<Users size={16} />}
          >
            Review Registrations ({summary.customers.pendingApprovals})
          </ClayButton>
        </div>
      </div>

      {/* Pending Approvals Alert Banner (if pending) */}
      {summary.customers.pendingApprovals > 0 && (
        <ClayAlert
          type="warning"
          title="Customer Registrations Pending Review"
          message={`There are ${summary.customers.pendingApprovals} customer registration requests awaiting your verification of biometric and bank details.`}
          action={
            <ClayButton
              variant="primary"
              size="sm"
              onClick={() => navigate('/customers/approvals')}
              rightIcon={<ArrowRight size={14} />}
            >
              Review Now
            </ClayButton>
          }
        />
      )}

      {/* Primary Operational Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ClayStatCard
          title="Today's Milk Collection"
          value={summary.todayCollection.totalLiters.toFixed(1)}
          unit="Liters"
          subtitle={`${summary.todayCollection.transactionCount} transactions recorded`}
          trend={{ value: '+4.2%', isPositive: true, label: 'vs yesterday' }}
          icon={<MilkCanVisual size={24} />}
          iconBgColor="bg-[#FFE9DC]"
          onClick={() => navigate('/collection/register')}
        />

        <ClayStatCard
          title="Today's Collection Value"
          value={`₹${summary.todayCollection.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          subtitle="Accredited to customer ledgers"
          icon={<DollarSign className="text-[#FF6A00]" size={22} />}
          iconBgColor="bg-[#FFF5EE]"
          onClick={() => navigate('/ledger')}
        />

        <ClayStatCard
          title="Pending Customer Approvals"
          value={summary.customers.pendingApprovals}
          subtitle="Awaiting admin verification"
          icon={<FaceBiometricVisual size={24} />}
          iconBgColor="bg-amber-100"
          onClick={() => navigate('/customers/approvals')}
        />

        <ClayStatCard
          title="Active Collection Devices"
          value={`${summary.systemStatus.connectedDevicesCount} Online`}
          subtitle={
            summary.systemStatus.offlineDevicesCount > 0
              ? `${summary.systemStatus.offlineDevicesCount} hardware offline`
              : 'All machines connected'
          }
          icon={<IotMachineVisual size={24} />}
          iconBgColor="bg-emerald-100"
          onClick={() => navigate('/devices')}
        />
      </div>

      {/* Milk Breakdown & Secondary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ClayCard className="flex items-center gap-3.5 !p-4">
          <div className="w-12 h-12 rounded-xl bg-[#FFF5EE] border border-[#FFE9DC] flex items-center justify-center shrink-0">
            <CowVisual size={28} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#817A75] uppercase">Cow Milk Today</p>
            <h4 className="text-xl font-black text-[#211B18] mt-0.5">
              {summary.todayCollection.cowLiters.toFixed(1)} <span className="text-xs font-semibold text-[#817A75]">L</span>
            </h4>
            <p className="text-[11px] text-[#817A75]">Avg Fat: 4.1% • SNF: 8.6%</p>
          </div>
        </ClayCard>

        <ClayCard className="flex items-center gap-3.5 !p-4">
          <div className="w-12 h-12 rounded-xl bg-[#F1E7E0] border border-[#E5D8CF] flex items-center justify-center shrink-0">
            <BuffaloVisual size={28} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#817A75] uppercase">Buffalo Milk Today</p>
            <h4 className="text-xl font-black text-[#211B18] mt-0.5">
              {summary.todayCollection.buffaloLiters.toFixed(1)} <span className="text-xs font-semibold text-[#817A75]">L</span>
            </h4>
            <p className="text-[11px] text-[#817A75]">Avg Fat: 7.1% • SNF: 9.0%</p>
          </div>
        </ClayCard>

        <ClayCard className="flex items-center gap-3.5 !p-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
            <LedgerShieldVisual size={28} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#817A75] uppercase">Pending Farmer Balances</p>
            <h4 className="text-xl font-black text-[#211B18] mt-0.5">
              ₹{summary.finance.pendingCustomerBalances.toLocaleString('en-IN')}
            </h4>
            <p className="text-[11px] text-blue-700 font-semibold">Fortnightly Cycle Ready</p>
          </div>
        </ClayCard>

        <ClayCard className="flex items-center gap-3.5 !p-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center shrink-0">
            <Package className="text-[#FF6A00]" size={24} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-[#817A75] uppercase">Feed Inventory Status</p>
            <h4 className="text-xl font-black text-[#211B18] mt-0.5">
              {summary.inventory.totalProducts} Products
            </h4>
            <p className="text-[11px] text-amber-700 font-semibold">
              {summary.inventory.lowStockItemCount} low stock alerts
            </p>
          </div>
        </ClayCard>
      </div>

      {/* Visual Charts: Milk Volume & Quality Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Collection Volume Chart */}
        <ClayCard className="lg:col-span-2">
          <div className="flex items-center justify-between pb-4 border-b border-[#F1E7E0] mb-4">
            <div>
              <h3 className="text-base font-bold text-[#211B18]">7-Day Milk Collection Volume</h3>
              <p className="text-xs text-[#817A75] mt-0.5">Daily Cow vs. Buffalo Liters breakdown</p>
            </div>
            <ClayButton variant="ghost" size="sm" onClick={() => navigate('/reports')}>
              View Report
            </ClayButton>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={collectionTrendsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1E7E0" />
                <XAxis dataKey="day" tick={{ fill: '#817A75', fontSize: 12 }} axisLine={{ stroke: '#F1E7E0' }} />
                <YAxis tick={{ fill: '#817A75', fontSize: 12 }} axisLine={{ stroke: '#F1E7E0' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#F1E7E0',
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
                <Legend iconType="circle" />
                <Bar dataKey="cow" name="Cow Milk (L)" fill="#FF6A00" radius={[4, 4, 0, 0]} />
                <Bar dataKey="buffalo" name="Buffalo Milk (L)" fill="#817A75" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ClayCard>

        {/* Quality Analytics Trends */}
        <ClayCard>
          <div className="flex items-center justify-between pb-4 border-b border-[#F1E7E0] mb-4">
            <div>
              <h3 className="text-base font-bold text-[#211B18]">Quality Parameters</h3>
              <p className="text-xs text-[#817A75] mt-0.5">Average Fat & SNF today</p>
            </div>
            <ClayButton variant="ghost" size="sm" onClick={() => navigate('/quality/analytics')}>
              Details
            </ClayButton>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={qualityTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1E7E0" />
                <XAxis dataKey="time" tick={{ fill: '#817A75', fontSize: 11 }} />
                <YAxis domain={[3.5, 9.5]} tick={{ fill: '#817A75', fontSize: 11 }} />
                <Tooltip />
                <Legend iconType="circle" />
                <Line
                  type="monotone"
                  dataKey="fat"
                  name="Fat %"
                  stroke="#FF6A00"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="snf"
                  name="SNF %"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ClayCard>
      </div>

      {/* Operational Fast Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
        <button
          onClick={() => navigate('/customers/directory')}
          className="p-4 rounded-xl bg-white border border-[#F1E7E0] hover:border-[#FFE9DC] hover:shadow-xs transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer"
        >
          <Users size={20} className="text-[#FF6A00]" />
          <span className="text-xs font-bold text-[#211B18]">Customer Directory</span>
        </button>

        <button
          onClick={() => navigate('/rate-charts')}
          className="p-4 rounded-xl bg-white border border-[#F1E7E0] hover:border-[#FFE9DC] hover:shadow-xs transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer"
        >
          <TrendingUp size={20} className="text-[#FF6A00]" />
          <span className="text-xs font-bold text-[#211B18]">Rate Charts</span>
        </button>

        <button
          onClick={() => navigate('/billing')}
          className="p-4 rounded-xl bg-white border border-[#F1E7E0] hover:border-[#FFE9DC] hover:shadow-xs transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer"
        >
          <FileText size={20} className="text-[#FF6A00]" />
          <span className="text-xs font-bold text-[#211B18]">Fortnightly Settlement</span>
        </button>

        <button
          onClick={() => navigate('/reports')}
          className="p-4 rounded-xl bg-white border border-[#F1E7E0] hover:border-[#FFE9DC] hover:shadow-xs transition-all flex flex-col items-center justify-center text-center gap-2 cursor-pointer"
        >
          <MilkCanVisual size={20} />
          <span className="text-xs font-bold text-[#211B18]">17 Business Reports</span>
        </button>
      </div>
    </div>
  )
}
