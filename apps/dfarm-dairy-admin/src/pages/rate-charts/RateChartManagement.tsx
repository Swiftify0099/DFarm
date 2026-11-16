import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { MilkRateChart } from '@/types'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayModal,
  ConfirmationModal,
  ClayAlert,
  ClayInput,
  ClaySelect,
  ClayTable,
  Column,
} from '@/components/ui'
import { CowVisual, BuffaloVisual } from '@/assets/illustrations'
import { TrendingUp, PlusCircle, CheckCircle2, Shield, History, Eye, Calendar } from 'lucide-react'

export const RateChartManagement: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showActivateModal, setShowActivateModal] = useState(false)
  const [selectedChart, setSelectedChart] = useState<MilkRateChart | null>(null)
  const [showMatrixModal, setShowMatrixModal] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  // Form State
  const [title, setTitle] = useState('')
  const [milkCategory, setMilkCategory] = useState<'COW' | 'BUFFALO'>('COW')
  const [baseRate, setBaseRate] = useState('38.5')
  const [minFat, setMinFat] = useState('3.0')
  const [maxFat, setMaxFat] = useState('5.0')
  const [fatStep, setFatStep] = useState('0.1')
  const [minSnf, setMinSnf] = useState('8.0')
  const [maxSnf, setMaxSnf] = useState('9.2')
  const [snfStep, setSnfStep] = useState('0.1')
  const [effectiveDate, setEffectiveDate] = useState('2026-12-01')
  const [changeNotes, setChangeNotes] = useState('')
  const [formError, setFormError] = useState('')

  const { data: rateCharts = [], isLoading } = useQuery({
    queryKey: ['rateCharts'],
    queryFn: () => api.rateCharts.getAll(),
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (params: any) => api.rateCharts.createDraftVersion(params, user?.fullName || 'Dairy Admin'),
    onSuccess: (newChart) => {
      queryClient.invalidateQueries({ queryKey: ['rateCharts'] })
      setShowCreateModal(false)
      setTitle('')
      setChangeNotes('')
      setNotice({
        type: 'success',
        message: `Draft rate chart version v${newChart.version} (${newChart.title}) successfully created. Ready for review.`,
      })
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to create rate chart version')
    },
  })

  // Activate mutation
  const activateMutation = useMutation({
    mutationFn: (chartId: string) => api.rateCharts.activateVersion(chartId, user?.fullName || 'Dairy Admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rateCharts'] })
      setShowActivateModal(false)
      setNotice({
        type: 'success',
        message: 'Rate chart activated. All new collection intake transactions will calculate rates using this version.',
      })
    },
    onError: (err: any) => {
      setNotice({ type: 'danger', message: err.message || 'Failed to activate rate chart' })
    },
  })

  const columns: Column<MilkRateChart>[] = [
    {
      key: 'version',
      header: 'Version / Title',
      render: (r) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xs bg-[#FFF5EE] border border-[#FFE9DC] text-[#FF6A00] px-2 py-0.5 rounded">
              v{r.version}
            </span>
            <span className="font-bold text-[#211B18] text-sm">{r.title}</span>
          </div>
          <p className="text-xs text-[#817A75] mt-1">{r.changeNotes}</p>
        </div>
      ),
    },
    {
      key: 'milkCategory',
      header: 'Milk Category',
      render: (r) => (
        <ClayBadge
          variant={r.milkCategory === 'COW' ? 'cow' : 'buffalo'}
          icon={r.milkCategory === 'COW' ? <CowVisual size={14} /> : <BuffaloVisual size={14} />}
        >
          {r.milkCategory}
        </ClayBadge>
      ),
    },
    {
      key: 'baseRatePerLiter',
      header: 'Base Rate (₹/L)',
      render: (r) => (
        <span className="font-black text-xs text-[#FF6A00]">₹{r.baseRatePerLiter.toFixed(2)}</span>
      ),
    },
    {
      key: 'range',
      header: 'Fat / SNF Range',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[#211B18]">
            Fat: {r.minFat}% to {r.maxFat}% (step {r.fatStep})
          </p>
          <p className="text-[#817A75]">
            SNF: {r.minSnf}% to {r.maxSnf}% (step {r.snfStep})
          </p>
        </div>
      ),
    },
    {
      key: 'effectiveDate',
      header: 'Effective Date',
      render: (r) => (
        <div className="text-xs flex items-center gap-1 font-semibold text-[#211B18]">
          <Calendar size={13} className="text-[#817A75]" />
          {r.effectiveDate}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <ClayBadge
          variant={
            r.status === 'ACTIVE'
              ? 'approved'
              : r.status === 'DRAFT'
              ? 'pending'
              : 'neutral'
          }
        >
          {r.status}
        </ClayBadge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <ClayButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedChart(r)
              setShowMatrixModal(true)
            }}
            leftIcon={<Eye size={12} />}
          >
            Matrix
          </ClayButton>

          {r.status === 'DRAFT' && (
            <ClayButton
              variant="primary"
              size="sm"
              onClick={() => {
                setSelectedChart(r)
                setShowActivateModal(true)
              }}
              leftIcon={<CheckCircle2 size={12} />}
            >
              Activate
            </ClayButton>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp size={28} className="text-[#FF6A00]" />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">Milk Rate Chart Management</h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Strictly versioned Fat/SNF quality pricing grids. Past transactions retain immutable historical rate versions.
          </p>
        </div>

        <ClayButton
          variant="primary"
          size="sm"
          onClick={() => setShowCreateModal(true)}
          leftIcon={<PlusCircle size={16} />}
        >
          Create New Version
        </ClayButton>
      </div>

      {notice && (
        <ClayAlert
          type={notice.type}
          message={notice.message}
          action={
            <button onClick={() => setNotice(null)} className="text-xs underline font-bold cursor-pointer">
              Dismiss
            </button>
          }
        />
      )}

      {/* Versioning Policy Banner */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Strict Rate Versioning Guarantee: </span>
          When activating a new rate version, previously recorded collections will continue referencing their original
          rate version number. Retroactive alterations to historical collections are strictly prohibited.
        </div>
      </div>

      {/* Table */}
      <ClayCard className="!p-0 overflow-hidden">
        <ClayTable
          columns={columns}
          data={rateCharts}
          keyExtractor={(r) => r.id}
          isLoading={isLoading}
          emptyMessage="No rate charts configured"
          emptySubtext="Create a new rate version to begin."
        />
      </ClayCard>

      {/* Rate Matrix Preview Modal */}
      {selectedChart && (
        <ClayModal
          isOpen={showMatrixModal}
          onClose={() => setShowMatrixModal(false)}
          title={`Rate Matrix: ${selectedChart.title} (v${selectedChart.version})`}
          subtitle={`Base Rate: ₹${selectedChart.baseRatePerLiter}/L • Effective: ${selectedChart.effectiveDate}`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-left">
            <div className="p-3 bg-[#FFF5EE] rounded-xl border border-[#FFE9DC] text-xs">
              <span className="font-bold text-[#211B18]">Two-Axis Fat & SNF Pricing Model: </span>
              Rates are calculated from the base price of ₹{selectedChart.baseRatePerLiter}/L with calibrated step
              increments per 0.1% Fat and 0.1% SNF deviation.
            </div>

            <div className="overflow-x-auto border border-[#F1E7E0] rounded-xl">
              <table className="w-full text-xs text-center border-collapse">
                <thead className="bg-[#FFF5EE] text-[#817A75] font-bold">
                  <tr>
                    <th className="p-2 border border-[#F1E7E0]">Fat \ SNF</th>
                    <th className="p-2 border border-[#F1E7E0]">8.0%</th>
                    <th className="p-2 border border-[#F1E7E0]">8.3%</th>
                    <th className="p-2 border border-[#F1E7E0]">8.5%</th>
                    <th className="p-2 border border-[#F1E7E0]">8.8%</th>
                    <th className="p-2 border border-[#F1E7E0]">9.0%</th>
                  </tr>
                </thead>
                <tbody>
                  {[3.2, 3.6, 4.0, 4.4, 4.8].map((fat) => (
                    <tr key={fat} className="hover:bg-[#FFF5EE]/40">
                      <td className="p-2 font-bold bg-[#FCF8F5] border border-[#F1E7E0]">{fat.toFixed(1)}%</td>
                      {[8.0, 8.3, 8.5, 8.8, 9.0].map((snf) => {
                        const calculatedRate = (
                          selectedChart.baseRatePerLiter +
                          (fat - 3.5) * 4.2 +
                          (snf - 8.5) * 3.5
                        ).toFixed(2)
                        return (
                          <td key={snf} className="p-2 font-mono font-bold text-[#FF6A00] border border-[#F1E7E0]">
                            ₹{calculatedRate}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3 border-t border-[#F1E7E0]">
              <ClayButton variant="ghost" size="md" onClick={() => setShowMatrixModal(false)}>
                Close
              </ClayButton>
            </div>
          </div>
        </ClayModal>
      )}

      {/* Create Version Modal */}
      <ClayModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Draft New Milk Rate Chart Version"
        subtitle="Specify parameters and step formulas for the next pricing revision"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setFormError('')
            createMutation.mutate({
              title,
              milkCategory,
              baseRatePerLiter: parseFloat(baseRate),
              minFat: parseFloat(minFat),
              maxFat: parseFloat(maxFat),
              fatStep: parseFloat(fatStep),
              minSnf: parseFloat(minSnf),
              maxSnf: parseFloat(maxSnf),
              snfStep: parseFloat(snfStep),
              effectiveDate,
              changeNotes,
            })
          }}
          className="space-y-4 text-left"
        >
          {formError && <ClayAlert type="danger" message={formError} />}

          <ClayInput
            label="Chart Title"
            placeholder="e.g. Winter 2026 Revision"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <ClaySelect
              label="Milk Category"
              options={[
                { label: 'Cow Milk', value: 'COW' },
                { label: 'Buffalo Milk', value: 'BUFFALO' },
              ]}
              value={milkCategory}
              onChange={(e) => setMilkCategory(e.target.value as any)}
            />

            <ClayInput
              label="Base Rate (₹/L)"
              type="number"
              step="0.1"
              value={baseRate}
              onChange={(e) => setBaseRate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <ClayInput label="Min Fat %" type="number" step="0.1" value={minFat} onChange={(e) => setMinFat(e.target.value)} />
            <ClayInput label="Max Fat %" type="number" step="0.1" value={maxFat} onChange={(e) => setMaxFat(e.target.value)} />
            <ClayInput label="Fat Step" type="number" step="0.05" value={fatStep} onChange={(e) => setFatStep(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <ClayInput label="Min SNF %" type="number" step="0.1" value={minSnf} onChange={(e) => setMinSnf(e.target.value)} />
            <ClayInput label="Max SNF %" type="number" step="0.1" value={maxSnf} onChange={(e) => setMaxSnf(e.target.value)} />
            <ClayInput label="SNF Step" type="number" step="0.05" value={snfStep} onChange={(e) => setSnfStep(e.target.value)} />
          </div>

          <ClayInput
            label="Effective Date"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            required
          />

          <ClayInput
            label="Revision Notes / Rationale"
            placeholder="e.g. Approved price hike by board of directors"
            value={changeNotes}
            onChange={(e) => setChangeNotes(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1E7E0]">
            <ClayButton variant="ghost" size="md" type="button" onClick={() => setShowCreateModal(false)}>
              Cancel
            </ClayButton>
            <ClayButton variant="primary" size="md" type="submit" isLoading={createMutation.isPending}>
              Create Draft Version
            </ClayButton>
          </div>
        </form>
      </ClayModal>

      {/* Activate Confirmation */}
      <ConfirmationModal
        isOpen={showActivateModal}
        onClose={() => setShowActivateModal(false)}
        onConfirm={async () => {
          if (selectedChart) {
            await activateMutation.mutateAsync(selectedChart.id)
          }
        }}
        title="Activate Rate Chart Version"
        message={`Activate ${selectedChart?.title} (v${selectedChart?.version}) for ${selectedChart?.milkCategory} milk? All new milk intake transactions will use these rates.`}
        confirmText="Confirm Activation"
        variant="success"
        isLoading={activateMutation.isPending}
      />
    </div>
  )
}
