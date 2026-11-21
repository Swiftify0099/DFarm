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
import type { GlobalRatePolicy, GlobalRatePolicyVersion } from '@/types'
import { formatDate } from '@/utils/formatters'
import {
  FileCheck2,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  ShieldCheck,
  TrendingUp,
  Building2,
  ChevronRight,
  ChevronDown,
  Lock,
  Layers,
  History,
} from 'lucide-react'

export const GlobalRatePoliciesPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [expandedPolicyId, setExpandedPolicyId] = useState<string | null>(null)

  // Modals state
  const [createPolicyModalOpen, setCreatePolicyModalOpen] = useState(false)
  const [createVersionPolicy, setCreateVersionPolicy] = useState<GlobalRatePolicy | null>(null)
  const [publishingVersion, setPublishingVersion] = useState<{
    policyId: string
    versionId: string
    versionNumber: number
  } | null>(null)

  // Form states for new Policy
  const [newPolicyCode, setNewPolicyCode] = useState('')
  const [newPolicyName, setNewPolicyName] = useState('')
  const [newPolicyDesc, setNewPolicyDesc] = useState('')
  const [newPolicyType, setNewPolicyType] = useState('STANDARD_BASE')

  // Form states for new Version Draft
  const [verEffectiveFrom, setVerEffectiveFrom] = useState('')
  const [verEffectiveTo, setVerEffectiveTo] = useState('')
  const [verCowFat, setVerCowFat] = useState('3.5')
  const [verCowSnf, setVerCowSnf] = useState('8.5')
  const [verCowRate, setVerCowRate] = useState('38.00')
  const [verBufFat, setVerBufFat] = useState('6.0')
  const [verBufSnf, setVerBufSnf] = useState('9.0')
  const [verBufRate, setVerBufRate] = useState('58.00')
  const [verChangeSummary, setVerChangeSummary] = useState('')

  // Query policies
  const { data: policies = [], isLoading } = useQuery<GlobalRatePolicy[]>({
    queryKey: queryKeys.policies.rateAll,
    queryFn: () => apiClient.getGlobalRatePolicies(),
  })

  // Mutations
  const createPolicyMutation = useMutation({
    mutationFn: () =>
      apiClient.createGlobalRatePolicy({
        policyCode: newPolicyCode.trim().toUpperCase(),
        name: newPolicyName.trim(),
        description: newPolicyDesc.trim() || undefined,
        policyType: newPolicyType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.policies.rateAll })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setCreatePolicyModalOpen(false)
      setNewPolicyCode('')
      setNewPolicyName('')
      setNewPolicyDesc('')
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to create global rate policy')
    },
  })

  const createVersionMutation = useMutation({
    mutationFn: () => {
      if (!createVersionPolicy) throw new Error('Policy not selected')
      return apiClient.createGlobalRatePolicyVersion(createVersionPolicy.id, {
        effectiveFrom: new Date(verEffectiveFrom).toISOString(),
        effectiveTo: verEffectiveTo ? new Date(verEffectiveTo).toISOString() : undefined,
        changeSummary: verChangeSummary || 'Policy procurement baseline update',
        parameters: {
          cow: {
            baseFat: Number(verCowFat),
            baseSnf: Number(verCowSnf),
            baseRate: Number(verCowRate),
          },
          buffalo: {
            baseFat: Number(verBufFat),
            baseSnf: Number(verBufSnf),
            baseRate: Number(verBufRate),
          },
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.policies.rateAll })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setCreateVersionPolicy(null)
      setVerChangeSummary('')
      setVerEffectiveFrom('')
      setVerEffectiveTo('')
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to create version draft')
    },
  })

  const publishMutation = useMutation({
    mutationFn: (target: { policyId: string; versionId: string }) =>
      apiClient.publishGlobalRatePolicyVersion(target.policyId, target.versionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.policies.rateAll })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setPublishingVersion(null)
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to publish policy version')
    },
  })

  const filteredPolicies = policies.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.policyCode.toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'ALL' || p.policyType === typeFilter
    return matchesSearch && matchesType
  })

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
              Global Rate Policy Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFE9DC] text-[#FF6A00] border border-[#FDBA74]/50">
              Control-Plane
            </span>
          </div>
          <p className="text-xs text-[#817A75] mt-0.5">
            Define statutory minimum procurement prices and federation-wide rate policy baselines.
          </p>
        </div>

        <ClayButton
          variant="primary"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setCreatePolicyModalOpen(true)}
        >
          Create Rate Policy
        </ClayButton>
      </div>

      {/* Governance & Architectural Boundary Card */}
      <ClayCard variant="peach" className="space-y-2.5">
        <div className="flex items-center gap-2 text-[#FF6A00] font-bold text-sm">
          <ShieldCheck className="w-5 h-5 shrink-0" />
          <span>Statutory Policy Architecture: Procurement Floor Governance</span>
        </div>
        <p className="text-xs text-[#817A75] leading-relaxed">
          Super Admin sets the <strong>Authorized Dairy / Federation Procurement Price Floor</strong>. Dairy Admins manage their own operational rate charts within their tenant nodes. Published global policy versions are immutable, cryptographically sealed with SHA-256 checksums, and cannot be silently overwritten.
        </p>
      </ClayCard>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <ClayInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search policies by code or title..."
            leftIcon={<Search className="w-4 h-4 text-[#817A75]" />}
          />
        </div>
        <div className="w-full sm:w-64">
          <ClaySelect
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Policy Types' },
              { value: 'STANDARD_BASE', label: 'Standard Baseline' },
              { value: 'STATUTORY_MINIMUM', label: 'Statutory Minimum' },
              { value: 'SEASONAL_INCENTIVE', label: 'Seasonal Incentive' },
              { value: 'QUALITY_PREMIUM', label: 'Quality Premium' },
              { value: 'INTER_DAIRY_BENCHMARK', label: 'Inter-Dairy Benchmark' },
            ]}
          />
        </div>
      </div>

      {/* Policy List */}
      {isLoading ? (
        <div className="p-12 text-center text-xs font-semibold text-[#817A75]">
          Loading platform rate policies from dfarm_central...
        </div>
      ) : filteredPolicies.length === 0 ? (
        <ClayCard variant="default" className="p-12 text-center space-y-3">
          <FileCheck2 className="w-12 h-12 text-[#D9CBC1] mx-auto" />
          <h3 className="font-bold text-base text-[#211B18]">No Global Rate Policies Found</h3>
          <p className="text-xs text-[#817A75] max-w-sm mx-auto">
            {search ? 'No policies matched your search criteria.' : 'Create your first global rate policy to establish procurement price baselines.'}
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
                {/* Policy Header Row */}
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

                {/* Quick Glance Parameters if active version exists */}
                {activeVersion && (
                  <div className="p-3.5 rounded-xl bg-[#FAF6F3] border border-[#F1E7E0] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-[#817A75] uppercase block">Active Version</span>
                      <strong className="text-[#211B18] font-mono text-sm">
                        v{activeVersion.versionNumber} ({activeVersion.status})
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-[#817A75] uppercase block">Cow Base Rate</span>
                      <strong className="text-emerald-700 font-mono text-sm">
                        ₹{activeVersion.parameters?.cow?.baseRate?.toFixed(2) || '—'} / L
                      </strong>
                      <span className="text-[10px] text-[#817A75] block">
                        Fat {activeVersion.parameters?.cow?.baseFat}% • SNF {activeVersion.parameters?.cow?.baseSnf}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-[#817A75] uppercase block">Buffalo Base Rate</span>
                      <strong className="text-emerald-700 font-mono text-sm">
                        ₹{activeVersion.parameters?.buffalo?.baseRate?.toFixed(2) || '—'} / L
                      </strong>
                      <span className="text-[10px] text-[#817A75] block">
                        Fat {activeVersion.parameters?.buffalo?.baseFat}% • SNF {activeVersion.parameters?.buffalo?.baseSnf}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-[#817A75] uppercase block">Applicability Scope</span>
                      <span className="text-[#211B18] font-bold flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3.5 h-3.5 text-[#FF6A00]" />
                        All Registered Dairies
                      </span>
                    </div>
                  </div>
                )}

                {/* Expandable Version History Table */}
                {isExpanded && (
                  <div className="pt-3 border-t border-[#F1E7E0] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#211B18] uppercase tracking-wider flex items-center gap-1.5">
                        <History className="w-4 h-4 text-[#FF6A00]" />
                        Version History ({versions.length})
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-[#F1E7E0] bg-[#FFF5EE]/50 text-[#817A75] font-bold">
                            <th className="py-2 px-3">Version</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3">Effective From</th>
                            <th className="py-2 px-3">Cow Base</th>
                            <th className="py-2 px-3">Buffalo Base</th>
                            <th className="py-2 px-3 font-mono">Checksum (SHA-256)</th>
                            <th className="py-2 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F1E7E0]">
                          {versions.map((ver) => (
                            <tr key={ver.id} className="hover:bg-[#FAF6F3]">
                              <td className="py-2.5 px-3 font-bold font-mono text-[#211B18]">
                                v{ver.versionNumber}
                              </td>
                              <td className="py-2.5 px-3">
                                <ClayBadge
                                  variant={ver.status === 'PUBLISHED' ? 'active' : 'draft_onboarding'}
                                  label={ver.status}
                                />
                              </td>
                              <td className="py-2.5 px-3 text-[#211B18]">
                                {formatDate(ver.effectiveFrom)}
                              </td>
                              <td className="py-2.5 px-3 font-mono">
                                ₹{ver.parameters?.cow?.baseRate?.toFixed(2) || '—'}
                              </td>
                              <td className="py-2.5 px-3 font-mono">
                                ₹{ver.parameters?.buffalo?.baseRate?.toFixed(2) || '—'}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[10px] text-[#817A75] max-w-[140px] truncate" title={ver.checksum}>
                                {ver.checksum || 'Pending'}
                              </td>
                              <td className="py-2.5 px-3 text-right">
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
                                  <span className="text-[11px] font-bold text-emerald-700 flex items-center justify-end gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Active Immutable
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </ClayCard>
            )
          })}
        </div>
      )}

      {/* Modal: Create Rate Policy */}
      <ClayModal
        isOpen={createPolicyModalOpen}
        onClose={() => setCreatePolicyModalOpen(false)}
        title="Create Global Rate Policy"
        subtitle="Establish a new statutory procurement policy code and definition."
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
            placeholder="e.g. GRP-MAHA-2026"
            value={newPolicyCode}
            onChange={(e) => setNewPolicyCode(e.target.value)}
          />
          <ClayInput
            label="Policy Name *"
            placeholder="e.g. Maharashtra State Baseline Rate Policy"
            value={newPolicyName}
            onChange={(e) => setNewPolicyName(e.target.value)}
          />
          <ClaySelect
            label="Policy Type"
            value={newPolicyType}
            onChange={(e) => setNewPolicyType(e.target.value)}
            options={[
              { value: 'STANDARD_BASE', label: 'Standard Baseline' },
              { value: 'STATUTORY_MINIMUM', label: 'Statutory Minimum' },
              { value: 'SEASONAL_INCENTIVE', label: 'Seasonal Incentive' },
              { value: 'QUALITY_PREMIUM', label: 'Quality Premium' },
              { value: 'INTER_DAIRY_BENCHMARK', label: 'Inter-Dairy Benchmark' },
            ]}
          />
          <ClayTextarea
            label="Description / Procurement Rationale"
            placeholder="Official minimum support prices and quality baseline details..."
            value={newPolicyDesc}
            onChange={(e) => setNewPolicyDesc(e.target.value)}
          />
        </div>
      </ClayModal>

      {/* Modal: Create Version Draft */}
      <ClayModal
        isOpen={!!createVersionPolicy}
        onClose={() => setCreateVersionPolicy(null)}
        title={`Draft Policy Version — ${createVersionPolicy?.policyCode}`}
        subtitle="Configure procurement price parameters and effective schedule."
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
            <ClayInput
              type="date"
              label="Effective Until (Optional)"
              value={verEffectiveTo}
              onChange={(e) => setVerEffectiveTo(e.target.value)}
            />
          </div>

          {/* Cow Milk Baseline Parameters */}
          <div className="p-3.5 rounded-xl bg-[#FAF6F3] border border-[#F1E7E0] space-y-3">
            <span className="text-xs font-bold text-[#211B18] uppercase tracking-wide flex items-center gap-1.5">
              🐄 Cow Milk Baseline Parameters
            </span>
            <div className="grid grid-cols-3 gap-3">
              <ClayInput
                label="Base Fat (%)"
                type="number"
                step="0.1"
                value={verCowFat}
                onChange={(e) => setVerCowFat(e.target.value)}
              />
              <ClayInput
                label="Base SNF (%)"
                type="number"
                step="0.1"
                value={verCowSnf}
                onChange={(e) => setVerCowSnf(e.target.value)}
              />
              <ClayInput
                label="Base Rate (₹/L)"
                type="number"
                step="0.5"
                value={verCowRate}
                onChange={(e) => setVerCowRate(e.target.value)}
              />
            </div>
          </div>

          {/* Buffalo Milk Baseline Parameters */}
          <div className="p-3.5 rounded-xl bg-[#FAF6F3] border border-[#F1E7E0] space-y-3">
            <span className="text-xs font-bold text-[#211B18] uppercase tracking-wide flex items-center gap-1.5">
              🐃 Buffalo Milk Baseline Parameters
            </span>
            <div className="grid grid-cols-3 gap-3">
              <ClayInput
                label="Base Fat (%)"
                type="number"
                step="0.1"
                value={verBufFat}
                onChange={(e) => setVerBufFat(e.target.value)}
              />
              <ClayInput
                label="Base SNF (%)"
                type="number"
                step="0.1"
                value={verBufSnf}
                onChange={(e) => setVerBufSnf(e.target.value)}
              />
              <ClayInput
                label="Base Rate (₹/L)"
                type="number"
                step="0.5"
                value={verBufRate}
                onChange={(e) => setVerBufRate(e.target.value)}
              />
            </div>
          </div>

          <ClayInput
            label="Change Summary"
            placeholder="e.g. Q3 Seasonal Procurement Revision"
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
        subtitle="Published rate policies become immediately immutable and authoritative across federation nodes."
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
              Once version {publishingVersion?.versionNumber} is published, its price floor parameters cannot be altered or silently modified. Subsequent changes require drafting a new version.
            </p>
          </div>
        </div>
      </ClayModal>
    </div>
  )
}
export default GlobalRatePoliciesPage
