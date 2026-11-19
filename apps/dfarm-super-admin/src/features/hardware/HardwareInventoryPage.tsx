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
import { ClayTable, type ColumnDef } from '@/components/ui/ClayTable'
import { ClayTextarea } from '@/components/ui/ClayTextarea'
import type { HardwareDevice, HardwareDeviceCategory, HardwareDeviceStatus, DairyTenant } from '@/types'
import { formatDate } from '@/utils/formatters'
import {
  HardDrive,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Wrench,
  RotateCcw,
  ArrowRightLeft,
  Cpu,
} from 'lucide-react'

export const HardwareInventoryPage: React.FC = () => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dairyFilter, setDairyFilter] = useState('ALL')

  // Modals state
  const [registerModalOpen, setRegisterModalOpen] = useState(false)
  const [assignTargetDevice, setAssignTargetDevice] = useState<HardwareDevice | null>(null)
  const [unassignTargetDevice, setUnassignTargetDevice] = useState<HardwareDevice | null>(null)
  const [statusTargetDevice, setStatusTargetDevice] = useState<HardwareDevice | null>(null)

  // Registration Form
  const [regSerial, setRegSerial] = useState('')
  const [regCategory, setRegCategory] = useState<HardwareDeviceCategory>('ANALYZER')
  const [regManufacturer, setRegManufacturer] = useState('')
  const [regModel, setRegModel] = useState('')
  const [regWarranty, setRegWarranty] = useState('')
  const [regNotes, setRegNotes] = useState('')

  // Assign Form
  const [selectedDairyId, setSelectedDairyId] = useState('')
  const [assignNotes, setAssignNotes] = useState('')

  // Unassign Form
  const [unassignNotes, setUnassignNotes] = useState('')

  // Status Form
  const [newStatus, setNewStatus] = useState<HardwareDeviceStatus>('AVAILABLE')
  const [statusNotes, setStatusNotes] = useState('')

  // Query Hardware
  const { data: hardware = [], isLoading } = useQuery<HardwareDevice[]>({
    queryKey: queryKeys.hardware.list({
      category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
      status: statusFilter !== 'ALL' ? statusFilter : undefined,
      dairyId: dairyFilter !== 'ALL' ? dairyFilter : undefined,
    }),
    queryFn: () =>
      apiClient.getHardware({
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        dairyId: dairyFilter !== 'ALL' ? dairyFilter : undefined,
      }),
  })

  // Query Dairies for assignment dropdown
  const { data: dairies = [] } = useQuery<DairyTenant[]>({
    queryKey: queryKeys.dairies.all,
    queryFn: () => apiClient.getDairies(),
  })

  // Mutations
  const registerMutation = useMutation({
    mutationFn: () =>
      apiClient.registerHardware({
        serialNumber: regSerial.trim().toUpperCase(),
        deviceCategory: regCategory,
        manufacturer: regManufacturer.trim(),
        model: regModel.trim(),
        warrantyUntil: regWarranty ? new Date(regWarranty).toISOString() : undefined,
        notes: regNotes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hardware.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setRegisterModalOpen(false)
      setRegSerial('')
      setRegManufacturer('')
      setRegModel('')
      setRegNotes('')
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to register hardware')
    },
  })

  const assignMutation = useMutation({
    mutationFn: () => {
      if (!assignTargetDevice || !selectedDairyId) throw new Error('Device and Dairy must be selected')
      return apiClient.assignHardware(assignTargetDevice.id, selectedDairyId, assignNotes)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hardware.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setAssignTargetDevice(null)
      setSelectedDairyId('')
      setAssignNotes('')
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to assign hardware')
    },
  })

  const unassignMutation = useMutation({
    mutationFn: () => {
      if (!unassignTargetDevice) throw new Error('Device must be selected')
      return apiClient.unassignHardware(unassignTargetDevice.id, unassignNotes)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hardware.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setUnassignTargetDevice(null)
      setUnassignNotes('')
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to unassign hardware')
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: () => {
      if (!statusTargetDevice) throw new Error('Device must be selected')
      return apiClient.updateHardwareStatus(statusTargetDevice.id, newStatus, statusNotes)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.hardware.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.metrics })
      setStatusTargetDevice(null)
      setStatusNotes('')
    },
    onError: (err: any) => {
      alert(err.message || 'Failed to update hardware status')
    },
  })

  const filteredHardware = hardware.filter((dev) => {
    const term = search.toLowerCase()
    return (
      dev.serialNumber.toLowerCase().includes(term) ||
      dev.manufacturer.toLowerCase().includes(term) ||
      dev.model.toLowerCase().includes(term) ||
      (dev.assignedDairyName && dev.assignedDairyName.toLowerCase().includes(term))
    )
  })

  // Metric counts
  const totalUnits = hardware.length
  const assignedUnits = hardware.filter((h) => h.status === 'ASSIGNED').length
  const availableUnits = hardware.filter((h) => h.status === 'AVAILABLE').length
  const maintenanceUnits = hardware.filter((h) => h.status === 'MAINTENANCE' || h.status === 'FAULTY').length

  const getStatusBadgeVariant = (status: HardwareDeviceStatus) => {
    switch (status) {
      case 'AVAILABLE':
        return 'healthy'
      case 'ASSIGNED':
        return 'active'
      case 'MAINTENANCE':
        return 'warning'
      case 'FAULTY':
        return 'critical'
      case 'RETIRED':
        return 'suspended'
      default:
        return 'neutral'
    }
  }

  const columns: ColumnDef<HardwareDevice>[] = [
    {
      key: 'serialNumber',
      header: 'Device & Serial Number',
      render: (dev) => (
        <div className="flex flex-col">
          <span className="font-mono font-bold text-sm text-[#211B18]">{dev.serialNumber}</span>
          <span className="text-xs text-[#817A75]">
            {dev.manufacturer} {dev.model}
          </span>
        </div>
      ),
    },
    {
      key: 'deviceCategory',
      header: 'Category',
      render: (dev) => (
        <span className="font-bold text-xs text-[#211B18] px-2.5 py-1 rounded-lg bg-[#FAF6F3] border border-[#F1E7E0] inline-block">
          {dev.deviceCategory.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Operational Status',
      render: (dev) => <ClayBadge variant={getStatusBadgeVariant(dev.status) as any} label={dev.status} />,
    },
    {
      key: 'assignedDairy',
      header: 'Dairy Allocation',
      render: (dev) => {
        if (!dev.assignedDairyId) {
          return <span className="text-xs text-[#817A75] italic">Central Inventory (Unallocated)</span>
        }
        const dairy = dairies.find((d) => d.id === dev.assignedDairyId)
        return (
          <div className="flex flex-col">
            <span className="font-bold text-xs text-[#211B18] flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-[#FF6A00]" />
              {dairy?.name || dev.assignedDairyName || 'Assigned Dairy'}
            </span>
            <span className="text-[10px] text-[#817A75] font-mono">
              {dairy?.code || dev.assignedDairyId.slice(0, 8)}
            </span>
          </div>
        )
      },
    },
    {
      key: 'warranty',
      header: 'Warranty Until',
      render: (dev) => (
        <span className="text-xs text-[#817A75]">
          {dev.warrantyUntil ? formatDate(dev.warrantyUntil) : 'Lifetime / Unset'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (dev) => (
        <div className="flex items-center justify-end gap-1.5">
          {dev.status === 'AVAILABLE' ? (
            <ClayButton
              variant="outline"
              size="sm"
              leftIcon={<ArrowRightLeft className="w-3.5 h-3.5" />}
              onClick={() => {
                setAssignTargetDevice(dev)
                setSelectedDairyId(dairies[0]?.id || '')
              }}
            >
              Allocate
            </ClayButton>
          ) : dev.status === 'ASSIGNED' ? (
            <ClayButton
              variant="outline"
              size="sm"
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
              onClick={() => setUnassignTargetDevice(dev)}
            >
              Unassign
            </ClayButton>
          ) : null}

          <ClayButton
            variant="ghost"
            size="sm"
            leftIcon={<Wrench className="w-3.5 h-3.5" />}
            onClick={() => {
              setStatusTargetDevice(dev)
              setNewStatus(dev.status)
            }}
          >
            Status
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
              Central Hardware Inventory & Allocation
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#FFE9DC] text-[#FF6A00] border border-[#FDBA74]/50">
              Control-Plane
            </span>
          </div>
          <p className="text-xs text-[#817A75] mt-0.5">
            Register, allocate, and monitor physical milk analyzers, weighing scales, and collection kiosks.
          </p>
        </div>

        <ClayButton
          variant="primary"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setRegisterModalOpen(true)}
        >
          Register Hardware Unit
        </ClayButton>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Total Units</span>
          <div className="text-2xl font-black text-[#211B18] font-mono">{totalUnits}</div>
          <span className="text-[10px] text-[#817A75]">Master inventory count</span>
        </ClayCard>
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Allocated Units</span>
          <div className="text-2xl font-black text-emerald-700 font-mono">{assignedUnits}</div>
          <span className="text-[10px] text-emerald-600 font-semibold">Active at Dairy nodes</span>
        </ClayCard>
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Available Stock</span>
          <div className="text-2xl font-black text-[#FF6A00] font-mono">{availableUnits}</div>
          <span className="text-[10px] text-[#817A75]">Ready for deployment</span>
        </ClayCard>
        <ClayCard variant="default" className="p-4 space-y-1">
          <span className="text-[11px] font-bold text-[#817A75] uppercase">Maintenance / Faulty</span>
          <div className="text-2xl font-black text-amber-700 font-mono">{maintenanceUnits}</div>
          <span className="text-[10px] text-amber-600 font-semibold">Under service check</span>
        </ClayCard>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <ClayInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by serial number, manufacturer, or model..."
            leftIcon={<Search className="w-4 h-4 text-[#817A75]" />}
          />
        </div>
        <div className="w-full sm:w-48">
          <ClaySelect
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Categories' },
              { value: 'ANALYZER', label: 'Milk Analyzer' },
              { value: 'WEIGHING_SCALE', label: 'Weighing Scale' },
              { value: 'RFID_READER', label: 'RFID Reader' },
              { value: 'COLLECTION_KIOSK', label: 'Collection Kiosk' },
              { value: 'PRINTER', label: 'Thermal Printer' },
              { value: 'CAMERA', label: 'Face AI Camera' },
            ]}
          />
        </div>
        <div className="w-full sm:w-44">
          <ClaySelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: 'ALL', label: 'All Statuses' },
              { value: 'AVAILABLE', label: 'Available' },
              { value: 'ASSIGNED', label: 'Assigned' },
              { value: 'MAINTENANCE', label: 'Maintenance' },
              { value: 'FAULTY', label: 'Faulty' },
            ]}
          />
        </div>
      </div>

      {/* Hardware Table */}
      <ClayTable
        columns={columns}
        data={filteredHardware}
        keyExtractor={(item) => item.id}
        isLoading={isLoading}
        emptyMessage="No hardware devices found matching your criteria."
      />

      {/* Modal: Register Hardware */}
      <ClayModal
        isOpen={registerModalOpen}
        onClose={() => setRegisterModalOpen(false)}
        title="Register Physical Hardware Unit"
        subtitle="Add a new verified machine into the central hardware inventory."
        size="lg"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <ClayButton variant="ghost" onClick={() => setRegisterModalOpen(false)}>
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              disabled={registerMutation.isPending || !regSerial || !regManufacturer || !regModel}
              onClick={() => registerMutation.mutate()}
            >
              {registerMutation.isPending ? 'Registering...' : 'Register Device'}
            </ClayButton>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ClayInput
              label="Serial Number *"
              placeholder="e.g. MA-800-SN-8921"
              value={regSerial}
              onChange={(e) => setRegSerial(e.target.value)}
            />
            <ClaySelect
              label="Device Category *"
              value={regCategory}
              onChange={(e) => setRegCategory(e.target.value as any)}
              options={[
                { value: 'ANALYZER', label: 'Milk Analyzer' },
                { value: 'WEIGHING_SCALE', label: 'Digital Weighing Scale' },
                { value: 'RFID_READER', label: 'RFID Reader' },
                { value: 'COLLECTION_KIOSK', label: 'Collection Kiosk' },
                { value: 'PRINTER', label: 'Thermal Receipt Printer' },
                { value: 'CAMERA', label: 'Face AI Biometric Camera' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ClayInput
              label="Manufacturer *"
              placeholder="e.g. Essae-Teraoka"
              value={regManufacturer}
              onChange={(e) => setRegManufacturer(e.target.value)}
            />
            <ClayInput
              label="Model Number *"
              placeholder="e.g. MA-800 Pro Ultra"
              value={regModel}
              onChange={(e) => setRegModel(e.target.value)}
            />
          </div>

          <ClayInput
            type="date"
            label="Warranty Expiry Date"
            value={regWarranty}
            onChange={(e) => setRegWarranty(e.target.value)}
          />

          <ClayTextarea
            label="Technical Specifications / Lab Notes"
            placeholder="Dual ultrasonic sensor, optical calibration bracket..."
            value={regNotes}
            onChange={(e) => setRegNotes(e.target.value)}
          />
        </div>
      </ClayModal>

      {/* Modal: Allocate Hardware */}
      <ClayModal
        isOpen={!!assignTargetDevice}
        onClose={() => setAssignTargetDevice(null)}
        title={`Allocate Device: ${assignTargetDevice?.serialNumber}`}
        subtitle="Assign this physical hardware unit to an active Dairy business."
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <ClayButton variant="ghost" onClick={() => setAssignTargetDevice(null)}>
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              disabled={assignMutation.isPending || !selectedDairyId}
              onClick={() => assignMutation.mutate()}
            >
              {assignMutation.isPending ? 'Allocating...' : 'Confirm Allocation'}
            </ClayButton>
          </div>
        }
      >
        <div className="space-y-4">
          <ClaySelect
            label="Target Dairy Tenant *"
            value={selectedDairyId}
            onChange={(e) => setSelectedDairyId(e.target.value)}
            options={dairies.map((d) => ({
              value: d.id,
              label: `${d.name} (${d.code})`,
            }))}
          />
          <ClayInput
            label="Deployment Notes"
            placeholder="e.g. Deployed to Main Collection Center 1 Counter A"
            value={assignNotes}
            onChange={(e) => setAssignNotes(e.target.value)}
          />
        </div>
      </ClayModal>

      {/* Modal: Unassign Hardware */}
      <ClayModal
        isOpen={!!unassignTargetDevice}
        onClose={() => setUnassignTargetDevice(null)}
        title={`Return Device: ${unassignTargetDevice?.serialNumber}`}
        subtitle="Unassign device from Dairy and return to central inventory."
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <ClayButton variant="ghost" onClick={() => setUnassignTargetDevice(null)}>
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              disabled={unassignMutation.isPending}
              onClick={() => unassignMutation.mutate()}
            >
              {unassignMutation.isPending ? 'Unassigning...' : 'Return to Inventory'}
            </ClayButton>
          </div>
        }
      >
        <div className="space-y-4 text-xs text-[#817A75]">
          <p>
            The device will become immediately available in central stock. An immutable assignment history record will be preserved for compliance.
          </p>
          <ClayInput
            label="Return Reason / Lab Notes"
            placeholder="e.g. Returned from field for scheduled overhaul"
            value={unassignNotes}
            onChange={(e) => setUnassignNotes(e.target.value)}
          />
        </div>
      </ClayModal>

      {/* Modal: Status Change */}
      <ClayModal
        isOpen={!!statusTargetDevice}
        onClose={() => setStatusTargetDevice(null)}
        title={`Change Status: ${statusTargetDevice?.serialNumber}`}
        subtitle="Update machine operational state."
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <ClayButton variant="ghost" onClick={() => setStatusTargetDevice(null)}>
              Cancel
            </ClayButton>
            <ClayButton
              variant="primary"
              disabled={updateStatusMutation.isPending}
              onClick={() => updateStatusMutation.mutate()}
            >
              {updateStatusMutation.isPending ? 'Updating...' : 'Save Status'}
            </ClayButton>
          </div>
        }
      >
        <div className="space-y-4">
          <ClaySelect
            label="New Operational Status *"
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as any)}
            options={[
              { value: 'AVAILABLE', label: 'AVAILABLE (In Central Inventory)' },
              { value: 'ASSIGNED', label: 'ASSIGNED (Active in Dairy)' },
              { value: 'MAINTENANCE', label: 'MAINTENANCE (Calibration / Repair)' },
              { value: 'FAULTY', label: 'FAULTY (Defective / Awaiting Parts)' },
              { value: 'RETIRED', label: 'RETIRED (End of Life)' },
            ]}
          />
          <ClayInput
            label="Status Reason / Technician Notes"
            placeholder="e.g. Ultrasonic transducer recalibration scheduled"
            value={statusNotes}
            onChange={(e) => setStatusNotes(e.target.value)}
          />
        </div>
      </ClayModal>
    </div>
  )
}
export default HardwareInventoryPage
