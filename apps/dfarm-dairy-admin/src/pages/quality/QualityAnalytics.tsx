import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api'
import type { MilkQualityReading } from '@/types'
import {
  ClayCard,
  ClayBadge,
  ClaySelect,
  ClayTable,
  Column,
} from '@/components/ui'
import { QualityAnalyzerVisual, CowVisual, BuffaloVisual } from '@/assets/illustrations'
import { Activity, AlertTriangle, CheckCircle2, Thermometer, Shield } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
} from 'recharts'

export const QualityAnalytics: React.FC = () => {
  const [filterCat, setFilterCat] = useState('ALL')

  const { data: readings = [], isLoading } = useQuery({
    queryKey: ['qualityReadings'],
    queryFn: () => api.quality.getReadings(),
  })

  const filteredReadings = readings.filter(
    (r) => filterCat === 'ALL' || r.category === filterCat
  )

  // Chart data points directly from real readings
  const chartData = readings.map((r) => ({
    time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    fat: r.fat,
    snf: r.snf,
    clr: r.clrDensity,
    category: r.category,
    customer: r.customerName,
  }))

  const columns: Column<MilkQualityReading>[] = [
    {
      key: 'timestamp',
      header: 'Time / Shift',
      render: (r) => (
        <div>
          <span className="font-semibold text-xs text-[#211B18]">
            {new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <p className="text-[10px] text-[#817A75]">{r.date} ({r.shift})</p>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Farmer Code / Name',
      render: (r) => (
        <div>
          <span className="font-extrabold text-[#FF6A00] text-xs bg-[#FFE9DC] px-2 py-0.5 rounded">
            {r.customerCode}
          </span>
          <span className="font-bold text-[#211B18] text-sm ml-2">{r.customerName}</span>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (r) => (
        <ClayBadge
          variant={r.category === 'COW' ? 'cow' : 'buffalo'}
          icon={r.category === 'COW' ? <CowVisual size={14} /> : <BuffaloVisual size={14} />}
        >
          {r.category}
        </ClayBadge>
      ),
    },
    {
      key: 'fat',
      header: 'Fat %',
      render: (r) => (
        <span className="font-extrabold text-xs text-[#FF6A00]">{r.fat.toFixed(1)}%</span>
      ),
    },
    {
      key: 'snf',
      header: 'SNF %',
      render: (r) => (
        <span className="font-extrabold text-xs text-emerald-800">{r.snf.toFixed(1)}%</span>
      ),
    },
    {
      key: 'clrDensity',
      header: 'CLR Density',
      render: (r) => <span className="font-mono text-xs">{r.clrDensity.toFixed(1)}</span>,
    },
    {
      key: 'adulterationStatus',
      header: 'Adulteration Sensor',
      render: (r) => (
        <ClayBadge variant={r.adulterationStatus === 'CLEAN' ? 'approved' : 'rejected'}>
          {r.adulterationStatus}
        </ClayBadge>
      ),
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <QualityAnalyzerVisual size={28} />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Milk Quality Analytics</h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Real lactometer and ultrasonic analyzer telemetry for Fat, SNF, and density tracking.
          </p>
        </div>

        <ClaySelect
          options={[
            { label: 'All Categories', value: 'ALL' },
            { label: 'Cow Milk Only', value: 'COW' },
            { label: 'Buffalo Milk Only', value: 'BUFFALO' },
          ]}
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="w-48"
        />
      </div>

      {/* Real Quality Chart */}
      <ClayCard>
        <div className="flex items-center justify-between pb-3 border-b border-[#F1E7E0] mb-4">
          <div>
            <h3 className="text-base font-bold text-[#211B18]">Fat & SNF Real Sensor Readings</h3>
            <p className="text-xs text-[#817A75]">Continuous intake quality trends</p>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1E7E0" />
              <XAxis dataKey="time" tick={{ fill: '#817A75', fontSize: 11 }} />
              <YAxis domain={[3.0, 10.0]} tick={{ fill: '#817A75', fontSize: 11 }} />
              <Tooltip />
              <Legend iconType="circle" />
              <Line type="monotone" dataKey="fat" name="Fat %" stroke="#FF6A00" strokeWidth={2.5} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="snf" name="SNF %" stroke="#10B981" strokeWidth={2.5} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ClayCard>

      {/* Sensor Readings Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={filteredReadings}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No quality readings recorded"
          emptySubtext="Quality records from milk analyzers will appear here."
        />
      </ClayCard>
    </div>
  )
}
