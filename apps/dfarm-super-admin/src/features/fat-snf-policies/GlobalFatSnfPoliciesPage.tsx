import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayTextarea } from '@/components/ui/ClayTextarea'
import type { GlobalFatSnfPolicy, FatAdjustmentRule, SnfAdjustmentRule } from '@/types'
import { formatDate } from '@/utils/formatters'
import {
  Percent,
  Plus,
  Search,
  CheckCircle2,
  ShieldCheck,
  Building2,
  ChevronRight,
  ChevronDown,
  Trash2,
  History,
  Scale,
} from 'lucide-react'

export const GlobalFatSnfPoliciesPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null)

  // Modals state
  const [createPolicyModalOpen, setCreatePolicyModalOpen] = useState(false)
  const [createVersionPolicy, setCreateVersionPolicy] = useState<GlobalFatSnfPolicy | null>(null)
  const [publishingVersion, setPublishingVersion] = useState<{
    policyId: string
    versionId: string
    versionNumber: number
  } | null>(null)

  // Form states for Policy creation
  const [newPolicyCode, setNewPolicyCode] = useState('')
  const [newPolicyName, setNewPolicyName] = useState('')
  const [newPolicyDesc, setNewPolicyDesc] = useState('')

  // Form states for Version creation
  const [verEffectiveFrom, setVerEffectiveFrom] = useState('')
  const [verMilkCategory, setVerMilkCategory] = useState<'COW' | 'BUFFALO' | 'BOTH'>('BOTH')
  const [verRoundingPolicy, setVerRoundingPolicy] = useState('NEAREST_TWO_DECIMALS')
  const [verChangeSummary, setVerChangeSummary] = useState('')

  // Brackets for version draft
  const [fatRules, setFatRules] = useState<FatAdjustmentRule[]>([
    { minFat: 3.0, maxFat: 3.49, deductionPerPoint: 0.25 },
    { minFat: 3.5, maxFat: 5.0, deductionPerPoint: 0.0 },
    { minFat: 5.01, maxFat: 8.0, deductionPerPoint: 0.0, bonusPerPoint: 0.3 },
  ])

  const [snfRules, setSnfRules] = useState<SnfAdjustmentRule[]>([
    { minSnf: 8.0, maxSnf: 8.49, deductionPerPoint: 0.3 },
    { minSnf: 8.5, maxSnf: 10.0, deductionPerPoint: 0.0 },
  ])

  // Query policies
  const { data: policies = [], isLoading } = useQuery<GlobalFatSnfPolicy[]>({
    queryKey: queryKeys.policies.fatSnfAll,
    queryFn: () => apiClient.getGlobalFatSnfPolicies(),
  })

  // Mutations
  const createPolicyMutation = useMutation({
    mutationFn: () =>
      apiClient.createGlobalFatSnfPolicy({
        policyCode: newPolicyCode.trim().toUpperCase(),
        name: newPolicyName.trim(),
        description: newPolicyDesc.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.policies.fatSnfAll })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setCreatePolicyModalOpen(false)
      setNewPolicyCode('')
      setNewPolicyName('')
      setNewPolicyDesc('')
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to create global FAT/SNF policy')
    },
  })

  const createVersionMutation = useMutation({
    mutationFn: () => {
      if (!createVersionPolicy) throw new Error('Policy not selected')
      return apiClient.createGlobalFatSnfPolicyVersion(createVersionPolicy.id, {
        effectiveFrom: new Date(verEffectiveFrom).toISOString(),
        milkCategory: verMilkCategory,
        roundingPolicy: verRoundingPolicy,
        fatAdjustmentRules: fatRules,
        snfAdjustmentRules: snfRules,
        changeSummary: verChangeSummary || 'Quality bracket calibration update',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.policies.fatSnfAll })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setCreateVersionPolicy(null)
      setVerChangeSummary('')
      setVerEffectiveFrom('')
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to create FAT/SNF version draft')
    },
  })

  const publishMutation = useMutation({
    mutationFn: (target: { policyId: string; versionId: string }) =>
      apiClient.publishGlobalFatSnfPolicyVersion(target.policyId, target.versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.policies.fatSnfAll })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setPublishingVersion(null)
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to publish FAT/SNF policy version')
    },
  })

  const filteredPolicies = policies.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.policyCode.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
              Global FAT/SNF Adjustment Policy
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFE9DC] text-[#FF6A00] border border-[#FDBA74]/50">
              Control-Plane
            </span>
          </div>
          <p className="text-xs text-[#817A75] mt-0.5">
            Standardized federation quality deduction grids and bonus rules for milk intake.
          </p>
        </div>

        <ClayButton
          variant="primary"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setCreatePolicyModalOpen(true)}
        >
          Create FAT/SNF Policy
        </ClayButton>
      </div>

      {/* Architecture Alert Banner */}
      <ClayCard variant="peach" className="space-y-2.5">
        <div className="flex items-center gap-2 text-[#FF6A00] font-bold text-sm">
          <Scale className="w-5 h-5 shrink-0" />
          <span>Quality Calibration Specification: Mathematically Defined Grid</span>
        </div>
        <p className="text-xs text-[#817A75] leading-relaxed">
          Zero guessed values: Deductions and quality incentives are calculated per 0.1% point bracket. Super Admin governs global baseline compensation rules to prevent farmer underpayment across all tenant collection counters.
        </p>
      </ClayCard>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <ClayInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search FAT/SNF policies by code or title..."
            leftIcon={<Search className="w-4 h-4 text-[#817A75]" />}
          />
        </div>
      </div>

      {/* Policy List */}
      {isLoading ? (
        <div className="p-12 text-center text-xs font-semibold text-[#817A75]">
          Loading platform FAT/SNF adjustment policies from dfarm_central...
        </div>
      ) : filteredPolicies.length === 0 ? (
        <ClayCard variant="default" className="p-12 text-center space-y-3">
          <Percent className="w-12 h-12 text-[#D9CBC1] mx-auto" />
          <h3 className="font-bold text-base text-[#211B18]">No FAT/SNF Policies Found</h3>
          <p className="text-xs text-[#817A75] max-w-sm mx-auto">
            {search ? 'No policies matched your search criteria.' : 'Create your first global FAT/SNF adjustment policy to standardize quality calculations.'}
          </p>
          {!search && (
            <ClayButton
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setCreatePolicyModalOpen(true)}
            >
              Create New Policy
            </ClayButton>
          )}
        </ClayCard>
      ) : (
        <div className="space-y-4">
          {filteredPolicies.map((policy) => {
            const isExpanded = expandedPolicyId === policy.id
            const versions = policy.versions || []
            const activeVersion = versions.find((v) => v.status === 'PUBLISHED') || versions[0]

            return (
              <ClayCard key={policy.id} variant="default" className="space-y-4 overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-black text-[#FF6A00] px-2 py-0.5 rounded-lg bg-[#FFE9DC] border border-[#FDBA74]/40">
                        {policy.policyCode}
                      </span>
                      <h3 className="text-base font-bold text-[#211B18]">{policy.name}</h3>
                      <ClayBadge variant={policy.isActive ? 'active' : 'suspended'} />
                    </div>
                    {policy.description && (
                      <p className="text-xs text-[#817A75] line-clamp-1">{policy.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <ClayButton
                      variant="outline"
                      size="sm"
                      leftIcon={<Plus className="w-3.5 h-3.5" />}
                      onClick={() => {
                        setCreateVersionPolicy(policy)
                        setVerEffectiveFrom(new Date().toISOString().slice(0, 10))
                      }}
                    >
                      Draft Version
                    </ClayButton>

                    <button
                      onClick={() => setExpandedPolicyId(isExpanded ? null : policy.id)}
                      className="p-2 rounded-xl text-[#817A75] hover:text-[#211B18] hover:bg-[#FAF6F3] transition-colors"
                      title={isExpanded ? 'Collapse' : 'Expand versions'}
                    >
                      {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {activeVersion && (
                  <div className="p-3.5 rounded-xl bg-[#FAF6F3] border border-[#F1E7E0] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-[#817A75] uppercase block">Active Version</span>
                      <strong className="text-[#211B18] font-mono text-sm">
                        v{activeVersion.versionNumber} ({activeVersion.status})
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-[#817A75] uppercase block">Milk Category</span>
                      <strong className="text-[#211B18] font-mono text-sm">
                        {activeVersion.milkCategory}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-[#817A75] uppercase block">Rounding Policy</span>
                      <strong className="text-[#211B18] font-mono text-sm">
                        {activeVersion.roundingPolicy || 'NEAREST_TWO_DECIMALS'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-[#817A75] uppercase block">Quality Brackets</span>
                      <span className="text-[#211B18] font-bold block mt-0.5">
                        {activeVersion.fatAdjustmentRules?.length || 0} FAT • {activeVersion.snfAdjustmentRules?.length || 0} SNF
                      </span>
                    </div>
                  </div>
                )}

                {isExpanded && (
                  <div className="pt-3 border-t border-[#F1E7E0] space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#211B18] uppercase tracking-wider flex items-center gap-1.5">
                        <History className="w-4 h-4 text-[#FF6A00]" />
                        Version History ({versions.length})
                      </span>
                    </div>

                    <div className="space-y-4">
                      {versions.map((ver) => (
                        <div key={ver.id} className="p-4 rounded-xl border border-[#F1E7E0] bg-[#FAF6F3]/50 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-sm text-[#211B18]">
                                Version {ver.versionNumber}
                              </span>
                              <ClayBadge
                                variant={ver.status === 'PUBLISHED' ? 'active' : 'draft_onboarding'}
                                label={ver.status}
                              />
                              <span className="text-xs text-[#817A75]">
                                Effective From: {formatDate(ver.effectiveFrom)}
                              </span>
                            </div>

                            {ver.status === 'DRAFT' ? (
                              <ClayButton
                                variant="primary"
                                size="sm"
                                onClick={() =>
                                  setPublishingVersion({
                                    policyId: policy.id,
                                    versionId: ver.id,
                                    versionNumber: ver.versionNumber,
                                  })
                                }
                              >
                                Publish
                              </ClayButton>
                            ) : (
                              <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Active Immutable
                              </span>
                            )}
                          </div>

                          {/* Quality Brackets Table */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            {/* FAT Table */}
                            <div className="bg-white rounded-lg border border-[#F1E7E0] p-3 space-y-2">
                              <span className="font-bold text-[#211B18] block">FAT Deduction / Incentive Brackets</span>
                              <div className="divide-y divide-[#F1E7E0]">
                                {(ver.fatAdjustmentRules || []).map((r, i) => (
                                  <div key={i} className="py-1.5 flex justify-between">
                                    <span className="font-mono text-[#817A75]">
                                      {r.minFat}% – {r.maxFat}%
                                    </span>
                                    <span className="font-bold text-[#211B18]">
                                      {r.deductionPerPoint > 0
                                        ? `-₹${r.deductionPerPoint.toFixed(2)} / point`
                                        : r.bonusPerPoint
                                        ? `+₹${r.bonusPerPoint.toFixed(2)} / point`
                                        : '₹0.00 (Standard)'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* SNF Table */}
                            <div className="bg-white rounded-lg border border-[#F1E7E0] p-3 space-y-2">
                              <span className="font-bold text-[#211B18] block">SNF Deduction / Incentive Brackets</span>
                              <div className="divide-y divide-[#F1E7E0]">
                                {(ver.snfAdjustmentRules || []).map((r, i) => (
                                  <div key={i} className="py-1.5 flex justify-between">
                                    <span className="font-mono text-[#817A75]">
                                      {r.minSnf}% – {r.maxSnf}%
                                    </span>
                                    <span className="font-bold text-[#211B18]">
                                      {r.deductionPerPoint > 0
                                        ? `-₹${r.deductionPerPoint.toFixed(2)} / point`
                                        : r.bonusPerPoint
                                        ? `+₹${r.bonusPerPoint.toFixed(2)} / point`
                                        : '₹0.00 (Standard)'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-[#817A75] pt-1">
                            <span>Change: {ver.changeSummary || 'Baseline parameters'}</span>
                            <span className="font-mono text-[10px]" title={ver.checksum}>
                              SHA-256: {ver.checksum?.slice(0, 16)}...
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ClayCard>
            )
          })}
        </div>
      )}

      {/* Modal: Create FAT/SNF Policy */}
      <ClayModal
        isOpen={createPolicyModalOpen}
        onClose={() => setCreatePolicyModalOpen(false)}
        title="Create Global FAT/SNF Policy"
        subtitle="Define a new standardized milk quality adjustment schedule."
        size="lg"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <ClayButton variant="ghost" onClick={() => setCreatePolicyModalOpen(false)}>
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              disabled={createPolicyMutation.isPending || !newPolicyCode || !newPolicyName}
              onClick={() => createPolicyMutation.mutate()}
            >
              {createPolicyMutation.isPending ? 'Creating...' : 'Create Policy'}
            </ClayButton>
          </div>
        }
      >
        <div className="space-y-4">
          <ClayInput
            label="Policy Code *"
            placeholder="e.g. FATSNF-STD-2026"
            value={newPolicyCode}
            onChange={(e) => setNewPolicyCode(e.target.value)}
          />
          <ClayInput
            label="Policy Name *"
            placeholder="e.g. Standard Federation FAT/SNF Quality Policy"
            value={newPolicyName}
            onChange={(e) => setNewPolicyName(e.target.value)}
          />
          <ClayTextarea
            label="Description / Procurement Calibration Scope"
            placeholder="Standardized quality brackets and deduction parameters..."
            value={newPolicyDesc}
            onChange={(e) => setNewPolicyDesc(e.target.value)}
          />
        </div>
      </ClayModal>

      {/* Modal: Create Version Draft */}
      <ClayModal
        isOpen={!!createVersionPolicy}
        onClose={() => setCreateVersionPolicy(null)}
        title={`Draft FAT/SNF Policy Version — ${createVersionPolicy?.policyCode}`}
        subtitle="Configure quality brackets, deduction values, and rounding policy."
        size="lg"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <ClayButton variant="ghost" onClick={() => setCreateVersionPolicy(null)}>
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              disabled={createVersionMutation.isPending || !verEffectiveFrom}
              onClick={() => createVersionMutation.mutate()}
            >
              {createVersionMutation.isPending ? 'Drafting...' : 'Save Draft Version'}
            </ClayButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ClayInput
              type="date"
              label="Effective From *"
              value={verEffectiveFrom}
              onChange={(e) => setVerEffectiveFrom(e.target.value)}
            />
            <ClaySelect
              label="Milk Category"
              value={verMilkCategory}
              onChange={(e) => setVerMilkCategory(e.target.value as any)}
              options={[
                { value: 'BOTH', label: 'Both Cow & Buffalo' },
                { value: 'COW', label: 'Cow Only' },
                { value: 'BUFFALO', label: 'Buffalo Only' },
              ]}
            />
          </div>

          <ClaySelect
            label="Rounding Policy"
            value={verRoundingPolicy}
            onChange={(e) => setVerRoundingPolicy(e.target.value)}
            options={[
              { value: 'NEAREST_TWO_DECIMALS', label: 'Nearest 2 Decimals (Standard)' },
              { value: 'ROUND_DOWN', label: 'Round Down (Floor)' },
              { value: 'ROUND_UP', label: 'Round Up (Ceil)' },
            ]}
          />

          <ClayInput
            label="Change Summary"
            placeholder="e.g. Temperature-compensated ultrasonic calibration grid"
            value={verChangeSummary}
            onChange={(e) => setVerChangeSummary(e.target.value)}
          />
        </div>
      </ClayModal>

      {/* Modal: Publish Confirmation */}
      <ClayModal
        isOpen={!!publishingVersion}
        onClose={() => setPublishingVersion(null)}
        title="Confirm Policy Version Publication"
        subtitle="Published adjustment policies are sealed and cryptographically verified."
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <ClayButton variant="ghost" onClick={() => setPublishingVersion(null)}>
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              disabled={publishMutation.isPending}
              onClick={() => {
                if (publishingVersion) {
                  publishMutation.mutate({
                    policyId: publishingVersion.policyId,
                    versionId: publishingVersion.versionId,
                  })
                }
              }}
            >
              {publishMutation.isPending ? 'Publishing...' : 'Confirm & Publish'}
            </ClayButton>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-[#817A75]">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 space-y-1">
            <span className="font-bold block">⚠️ Immutability Notice:</span>
            <p>
              Once version {publishingVersion?.versionNumber} is published, its quality brackets and deduction parameters cannot be modified.
            </p>
          </div>
        </div>
      </ClayModal>
    </div>
  )
}
export default GlobalFatSnfPoliciesPage
