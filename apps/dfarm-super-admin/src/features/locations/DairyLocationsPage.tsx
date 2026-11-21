import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/api/queryKeys'
import { apiClient } from '@/api/client'
import { ClayCard } from '@/components/ui/ClayCard'
import { ClayButton } from '@/components/ui/ClayButton'
import { ClayBadge } from '@/components/ui/ClayBadge'
import { ClayInput } from '@/components/ui/ClayInput'
import { ClaySelect } from '@/components/ui/ClaySelect'
import { ClayModal } from '@/components/ui/ClayModal'
import { ClayTable, type ColumnDef } from '@/components/ui/ClayTable'
import { DairyLocationPicker, type DairyLocationData } from '../dairies/DairyLocationPicker'
import { useAuth } from '@/context/AuthContext'
import type { DairyTenant } from '@/types'
import {
  MapPin,
  Search,
  Building2,
  Navigation,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Compass,
} from 'lucide-react'

export const DairyLocationsPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('ALL')
  const [editingDairy, setEditingDairy] = useState<DairyTenant | null>(null)
  const [pendingLocation, setPendingLocation] = useState<DairyLocationData | null>(null)

  // Query Dairies
  const { data: dairies = [], isLoading } = useQuery<DairyTenant[]>({
    queryKey: queryKeys.dairies.all,
    queryFn: () => apiClient.getDairies(),
  })

  // Mutation to save coordinates
  const updateLocationMutation = useMutation({
    mutationFn: async () => {
      if (!editingDairy || !pendingLocation) throw new Error('Dairy and Location required')
      return apiClient.updateDairyLocation(editingDairy.id, pendingLocation, user || undefined)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dairies.all })
      setEditingDairy(null)
      setPendingLocation(null)
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to update dairy location')
    },
  })

  const filteredDairies = dairies.filter((d) => {
    const term = search.toLowerCase()
    const matchesSearch =
      !term ||
      d.name.toLowerCase().includes(term) ||
      d.code.toLowerCase().includes(term) ||
      (d.location?.district && d.location.district.toLowerCase().includes(term)) ||
      (d.location?.state && d.location.state.toLowerCase().includes(term)) ||
      (d.location?.villageLocality && d.location.villageLocality.toLowerCase().includes(term))
    const matchesState = stateFilter === 'ALL' || d.location?.state === stateFilter
    return matchesSearch && matchesState
  })

  // Unique states for filter
  const stateOptions = Array.from(new Set(dairies.map((d) => d.location?.state).filter(Boolean)))

  // Stats
  const totalDairies = dairies.length
  const pinnedDairies = dairies.filter(
    (d) => d.location?.latitude !== undefined && d.location?.longitude !== undefined
  ).length
  const unpinnedDairies = totalDairies - pinnedDairies
  const eligibleForDiscovery = dairies.filter(
    (d) =>
      d.status === 'active' &&
      d.location?.latitude !== undefined &&
      d.location?.longitude !== undefined
  ).length

  const columns: ColumnDef<DairyTenant>[] = [
    {
      key: 'dairy',
      header: 'Dairy Business & Code',
      render: (d) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-[#FF6A00]" />
            <span className="font-bold text-sm text-[#211B18]">{d.name}</span>
          </div>
          <span className="text-xs text-[#817A75] font-mono">{d.code}</span>
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Village, District & State',
      render: (d) => (
        <div className="flex flex-col text-xs text-[#211B18]">
          <span>{d.location?.villageLocality || d.location?.addressLine1 || 'Local Area'}</span>
          <span className="text-[#817A75]">
            {d.location?.district || '—'}, {d.location?.state || '—'} {d.location?.pincode ? `(${d.location.pincode})` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'coordinates',
      header: 'Geographic Coordinates',
      render: (d) => {
        const hasCoords = d.location?.latitude !== undefined && d.location?.longitude !== undefined
        return hasCoords ? (
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold text-emerald-700 flex items-center gap-1">
              <Navigation className="w-3.5 h-3.5 text-emerald-600" />
              {d.location?.latitude?.toFixed(6)}, {d.location?.longitude?.toFixed(6)}
            </span>
            <span className="text-[10px] text-[#817A75]">Verified GPS Pin</span>
          </div>
        ) : (
          <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            Awaiting Pinning
          </span>
        )
      },
    },
    {
      key: 'discoveryStatus',
      header: 'Discovery Status',
      render: (d) => {
        const isEligible =
          d.status === 'active' &&
          d.location?.latitude !== undefined &&
          d.location?.longitude !== undefined
        return isEligible ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            Discovery Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
            Hidden from App
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (d) => (
        <div className="flex items-center justify-end gap-1.5">
          <ClayButton
            variant="outline"
            size="sm"
            leftIcon={<MapPin className="w-3.5 h-3.5 text-[#FF6A00]" />}
            onClick={() => {
              setEditingDairy(d)
              setPendingLocation(null)
            }}
          >
            Adjust Pin
          </ClayButton>
          <ClayButton
            variant="ghost"
            size="sm"
            leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
            onClick={() => navigate(`/dairies/${d.id}`)}
          >
            Profile
          </ClayButton>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[#211B18] tracking-tight">
              Dairy Locations & Discovery Directory
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFE9DC] text-[#FF6A00] border border-[#FDBA74]/50">
              Control-Plane
            </span>
          </div>
          <p className="text-xs text-[#817A75] mt-0.5">
            Geographic coordinates and customer proximity discovery configuration across tenant nodes.
          </p>
        </div>
      </div>

      {/* Discovery Governance Banner */}
      <ClayCard variant="peach" className="space-y-2.5">
        <div className="flex items-center gap-2 text-[#FF6A00] font-bold text-sm">
          <Compass className="w-5 h-5 shrink-0" />
          <span>Proximity Discovery Rule: Customer App Nearby Search</span>
        </div>
        <p className="text-xs text-[#817A75] leading-relaxed">
          The Customer Mobile App uses these stored coordinates to perform nearby dairy discovery via <code>/api/v1/dairies/nearby</code>. Inactive, suspended, or unpinned Dairies are strictly excluded from new customer farmer self-registration.
        </p>
      </ClayCard>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Total Dairies</span>
          <div className="text-2xl font-black text-[#211B18] font-mono">{totalDairies}</div>
          <span className="text-[10px] text-[#817A75]">Registered tenant businesses</span>
        </ClayCard>
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Geocoded & Pinned</span>
          <div className="text-2xl font-black text-emerald-700 font-mono">{pinnedDairies}</div>
          <span className="text-[10px] text-emerald-600 font-semibold">Valid GPS coordinates</span>
        </ClayCard>
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Discovery Eligible</span>
          <div className="text-2xl font-black text-[#FF6A00] font-mono">{eligibleForDiscovery}</div>
          <span className="text-[10px] text-[#817A75]">Visible in Customer App</span>
        </ClayCard>
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Needs Verification</span>
          <div className="text-2xl font-black text-amber-700 font-mono">{unpinnedDairies}</div>
          <span className="text-[10px] text-amber-600 font-semibold">Awaiting pin adjustment</span>
        </ClayCard>
      </div>

      {/* Filter Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <ClayInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Dairy name, code, village, district, or state..."
            leftIcon={<Search className="w-4 h-4 text-[#817A75]" />}
          />
        </div>
        <div className="w-full sm:w-48">
          <ClaySelect
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All States' },
              ...stateOptions.map((st) => ({ value: st!, label: st! })),
            ]}
          />
        </div>
      </div>

      {/* Table */}
      <ClayTable
        columns={columns}
        data={filteredDairies}
        keyExtractor={(item) => item.id}
        isLoading={isLoading}
        emptyMessage="No dairy locations found."
      />

      {/* Modal: Adjust Location Pin */}
      <ClayModal
        isOpen={!!editingDairy}
        onClose={() => {
          setEditingDairy(null)
          setPendingLocation(null)
        }}
        title={`Adjust Location Pin: ${editingDairy?.name}`}
        subtitle="Click or drag on the interactive map to adjust coordinates for customer discovery."
        size="2xl"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <ClayButton
              variant="ghost"
              onClick={() => {
                setEditingDairy(null)
                setPendingLocation(null)
              }}
            >
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              disabled={updateLocationMutation.isPending || !pendingLocation}
              onClick={() => updateLocationMutation.mutate()}
            >
              {updateLocationMutation.isPending ? 'Saving...' : 'Save Pin Location'}
            </ClayButton>
          </div>
        }
      >
        <div className="space-y-4">
          {editingDairy && (
            <DairyLocationPicker
              initialLatitude={editingDairy.location?.latitude ?? 18.5204303}
              initialLongitude={editingDairy.location?.longitude ?? 73.8567437}
              initialAddress={editingDairy.location?.formattedAddress || editingDairy.location?.addressLine1}
              onLocationSelect={(loc) => setPendingLocation(loc)}
              readOnly={false}
            />
          )}

          {pendingLocation && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 space-y-1">
              <span className="font-bold block">Selected GPS Coordinates:</span>
              <p className="font-mono">
                Latitude: {pendingLocation.latitude.toFixed(6)}, Longitude: {pendingLocation.longitude.toFixed(6)}
              </p>
              {pendingLocation.formattedAddress && (
                <p className="text-[11px] text-[#817A75]">{pendingLocation.formattedAddress}</p>
              )}
            </div>
          )}
        </div>
      </ClayModal>
    </div>
  )
}
export default DairyLocationsPage
