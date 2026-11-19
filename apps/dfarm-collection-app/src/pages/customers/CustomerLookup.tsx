import React, { useState, useEffect } from 'react'
import type { CustomerIdentity, MilkCategory } from '@/types'
import { customersApi } from '@/api/client'
import { ClayCard, ClayInput, ClayButton, ClayBadge, ClayTable } from '@/components/ui'
import { CustomerDetailModal } from './CustomerDetailModal'
import { Search, Users, ShieldCheck, Radio, Eye, UserCheck } from 'lucide-react'

interface CustomerLookupProps {
  onSelectCustomer?: (customer: CustomerIdentity) => void
}

export const CustomerLookup: React.FC<CustomerLookupProps> = ({ onSelectCustomer }) => {
  const [customers, setCustomers] = useState<CustomerIdentity[]>([])
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerIdentity[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | MilkCategory>('ALL')
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerIdentity | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadCustomers()
  }, [])

  const loadCustomers = async () => {
    setIsLoading(true)
    try {
      const list = await customersApi.list()
      setCustomers(list || [])
      setFilteredCustomers(list || [])
    } catch {
      setCustomers([])
      setFilteredCustomers([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let result = customers

    if (categoryFilter !== 'ALL') {
      result = result.filter((c) => c.preferredCategory === categoryFilter)
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      result = result.filter(
        (c) =>
          c.fullName.toLowerCase().includes(q) ||
          c.customerCode.toLowerCase().includes(q) ||
          c.village.toLowerCase().includes(q) ||
          c.mobileNumber.includes(q)
      )
    }

    setFilteredCustomers(result)
  }, [searchTerm, categoryFilter, customers])

  const handleOpenDetail = (cust: CustomerIdentity) => {
    setSelectedCustomer(cust)
    setIsModalOpen(true)
  }

  const columns = [
    {
      key: 'code',
      header: 'Code',
      render: (c: CustomerIdentity) => (
        <span className="font-mono font-bold text-xs bg-peach px-2 py-1 rounded text-primary-orange">
          {c.customerCode}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Patron Full Name',
      render: (c: CustomerIdentity) => (
        <div>
          <span className="font-bold text-sm text-text-primary block">{c.fullName}</span>
          <span className="text-xs text-text-muted">+91 {c.mobileNumber}</span>
        </div>
      ),
    },
    {
      key: 'village',
      header: 'Village',
      render: (c: CustomerIdentity) => <span className="text-xs text-text-secondary">{c.village}</span>,
    },
    {
      key: 'category',
      header: 'Milk Type',
      render: (c: CustomerIdentity) => (
        <ClayBadge variant={c.preferredCategory === 'COW' ? 'warning' : 'primary'} size="sm">
          {c.preferredCategory}
        </ClayBadge>
      ),
    },
    {
      key: 'balance',
      header: 'Pending Ledger',
      render: (c: CustomerIdentity) => (
        <span className="font-mono font-bold text-xs text-primary-orange">
          ₹{c.balanceDue.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'biometric',
      header: 'Biometric Status',
      render: (c: CustomerIdentity) => (
        <div className="flex items-center space-x-1.5 text-xs text-emerald-700">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold">
            {c.biometric ? `${c.biometric.qualityScore}% (YuNet)` : 'Pending'}
          </span>
        </div>
      ),
    },
    {
      key: 'rfid',
      header: 'RFID UID',
      render: (c: CustomerIdentity) => (
        <div className="flex items-center space-x-1 text-xs text-text-muted font-mono">
          <Radio className="w-3.5 h-3.5 text-primary-orange" />
          <span>{c.rfidCardUid || 'None'}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      render: (c: CustomerIdentity) => (
        <div className="flex items-center space-x-2">
          {onSelectCustomer && (
            <ClayButton
              variant="primary"
              size="sm"
              onClick={() => onSelectCustomer(c)}
              className="flex items-center space-x-1 text-xs"
            >
              <UserCheck className="w-3.5 h-3.5 mr-1" />
              <span>Select</span>
            </ClayButton>
          )}
          <ClayButton
            variant="secondary"
            size="sm"
            onClick={() => handleOpenDetail(c)}
            className="flex items-center space-x-1 text-xs"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View</span>
          </ClayButton>
        </div>
      ),
    },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-primary-orange" />
            <h2 className="text-xl font-bold text-text-primary">Customer Directory (F2)</h2>
          </div>
          <p className="text-xs text-text-muted mt-1">
            Browse enrolled dairy producers, inspect biometric profiles, and select for intake.
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center space-x-2">
          {(['ALL', 'COW', 'BUFFALO'] as const).map((cat) => (
            <ClayButton
              key={cat}
              variant={categoryFilter === cat ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setCategoryFilter(cat)}
              className="text-xs"
            >
              {cat === 'ALL' ? 'All Patrons' : `${cat} Only`}
            </ClayButton>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <ClayCard className="p-4 bg-cream">
        <ClayInput
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filter by customer code, full name, village, or mobile number..."
          leftIcon={<Search className="w-4 h-4 text-text-muted" />}
          className="w-full"
        />
      </ClayCard>

      {/* Patrons Table */}
      <ClayCard className="p-4 bg-cream">
        <ClayTable
          columns={columns}
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          emptyMessage="No matching customer records found."
        />
      </ClayCard>

      {/* Customer Detail Modal */}
      <CustomerDetailModal
        customer={selectedCustomer}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  )
}
