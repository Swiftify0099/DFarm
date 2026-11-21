import React, { useState, useEffect } from 'react'
import type { CustomerIdentity } from '@/types'
import { customersApi } from '@/api/client'
import { ClayModal, ClayInput, ClayButton, ClayBadge } from '@/components/ui'
import { Search, UserCheck, MapPin, Phone } from 'lucide-react'

interface CustomerLookupModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectCustomer: (customer: CustomerIdentity) => void
}

export const CustomerLookupModal: React.FC<CustomerLookupModalProps> = ({
  isOpen,
  onClose,
  onSelectCustomer,
}) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [customers, setCustomers] = useState<CustomerIdentity[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadCustomers()
    }
  }, [isOpen])

  const loadCustomers = async (search?: string) => {
    setIsLoading(true)
    try {
      const data = await customersApi.list(search ? { search } : undefined)
      setCustomers(data || [])
    } catch {
      setCustomers([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadCustomers(searchTerm)
  }

  const handleSelect = (customer: CustomerIdentity) => {
    onSelectCustomer(customer)
    onClose()
  }

  return (
    <ClayModal
      isOpen={isOpen}
      onClose={onClose}
      title="Manual Patron Search & Selection"
      description="Search dairy patrons by code, full name, mobile number, or village"
      size="lg"
    >
      <div className="space-y-4">
        {/* Search input form */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <ClayInput
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search patron (e.g. Patil, C-101, 9822...)"
            leftIcon={<Search className="w-4 h-4 text-text-muted" />}
            className="flex-1"
            autoFocus
          />
          <ClayButton type="submit" variant="primary">
            Search
          </ClayButton>
        </form>

        {/* Customer List */}
        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
          {isLoading ? (
            <div className="py-8 text-center text-text-muted text-xs">
              Searching registered patrons...
            </div>
          ) : customers.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-xs">
              No matching patron records found.
            </div>
          ) : (
            customers.map((cust) => (
              <div
                key={cust.id}
                onClick={() => handleSelect(cust)}
                className="p-3 bg-cream rounded-xl border border-border-subtle hover:border-primary-orange hover:bg-peach/30 transition-all flex items-center justify-between cursor-pointer group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-lg bg-peach flex items-center justify-center font-bold text-primary-orange group-hover:bg-primary-orange group-hover:text-white transition-colors">
                    {cust.customerCode}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-text-primary group-hover:text-primary-orange">
                      {cust.fullName}
                    </h4>
                    <div className="flex items-center space-x-3 text-xs text-text-muted mt-0.5">
                      <span className="flex items-center space-x-1">
                        <MapPin className="w-3 h-3 text-text-muted" />
                        <span>{cust.village}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Phone className="w-3 h-3 text-text-muted" />
                        <span>+91 {cust.mobileNumber}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <ClayBadge variant="primary" size="sm">
                    {cust.preferredCategory}
                  </ClayBadge>
                  <ClayButton variant="secondary" size="sm" onClick={() => handleSelect(cust)}>
                    <UserCheck className="w-3.5 h-3.5 mr-1 text-primary-orange" />
                    Select
                  </ClayButton>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ClayModal>
  )
}
