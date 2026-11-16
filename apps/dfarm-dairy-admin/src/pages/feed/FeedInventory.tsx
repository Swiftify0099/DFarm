import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'
import { useAuth } from '@/context/AuthContext'
import type { FeedProduct, FeedStockMovement, CustomerFeedSale } from '@/types'
import {
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayTabs,
  ClayModal,
  ConfirmationModal,
  ClayAlert,
  ClayInput,
  ClaySelect,
  ClayTable,
  Column,
} from '@/components/ui'
import { FeedBagVisual } from '@/assets/illustrations'
import { Package, PlusCircle, ShoppingCart, AlertTriangle, History, ArrowDown, ArrowUp, Shield } from 'lucide-react'

export const FeedInventory: React.FC = () => {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('products')

  // Modals
  const [showRestockModal, setShowRestockModal] = useState(false)
  const [showSaleModal, setShowSaleModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<FeedProduct | null>(null)

  // Restock form
  const [restockQty, setRestockQty] = useState('')
  const [restockReason, setRestockReason] = useState('')

  // Sale form
  const [saleCustId, setSaleCustId] = useState('')
  const [saleProdId, setSaleProdId] = useState('')
  const [saleQty, setSaleQty] = useState('1')
  const [salePaymentMode, setSalePaymentMode] = useState<'LEDGER_DEBIT' | 'CASH' | 'ONLINE'>('LEDGER_DEBIT')
  const [saleNotes, setSaleNotes] = useState('')

  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState<{ type: 'success' | 'danger'; message: string } | null>(null)

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['feedProducts'],
    queryFn: () => api.feed.getProducts(),
  })

  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ['feedMovements'],
    queryFn: () => api.feed.getMovements(),
  })

  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ['customerFeedSales'],
    queryFn: () => api.feed.getSales(),
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.customers.getAll(),
  })

  // Restock mutation
  const restockMutation = useMutation({
    mutationFn: ({ prodId, qty, reason }: { prodId: string; qty: number; reason: string }) =>
      api.feed.addStock(prodId, qty, reason, user?.fullName || 'Dairy Admin'),
    onSuccess: (updatedProd) => {
      queryClient.invalidateQueries({ queryKey: ['feedProducts'] })
      queryClient.invalidateQueries({ queryKey: ['feedMovements'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] })
      setShowRestockModal(false)
      setRestockQty('')
      setRestockReason('')
      setNotice({
        type: 'success',
        message: `Restocked ${updatedProd.name}. Available quantity updated to ${updatedProd.availableStock} ${updatedProd.unit}.`,
      })
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to restock product')
    },
  })

  // Record Sale mutation
  const saleMutation = useMutation({
    mutationFn: (params: any) => api.feed.recordSale(params, user?.fullName || 'Dairy Admin'),
    onSuccess: (newSale) => {
      queryClient.invalidateQueries({ queryKey: ['feedProducts'] })
      queryClient.invalidateQueries({ queryKey: ['feedMovements'] })
      queryClient.invalidateQueries({ queryKey: ['customerFeedSales'] })
      queryClient.invalidateQueries({ queryKey: ['ledgerEntries'] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] })
      setShowSaleModal(false)
      setSaleNotes('')
      setNotice({
        type: 'success',
        message: `Feed sale recorded for ${newSale.customerName}. Stock deducted and ₹${newSale.totalAmount.toFixed(2)} debited from milk ledger.`,
      })
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to record feed sale')
    },
  })

  const tabs = [
    { id: 'products', label: 'Feed Products & Stock', badge: products.length },
    { id: 'movements', label: 'Inventory Movements', badge: movements.length },
    { id: 'sales', label: 'Customer Feed Sales', badge: sales.length },
  ]

  // Product Columns
  const productCols: Column<FeedProduct>[] = [
    {
      key: 'name',
      header: 'Product Name / SKU',
      render: (r) => (
        <div>
          <span className="font-bold text-[#211B18] text-sm">{r.name}</span>
          <p className="text-[10px] text-[#817A75] font-mono mt-0.5">{r.sku} • {r.unit}</p>
        </div>
      ),
    },
    {
      key: 'rates',
      header: 'Purchase / Selling Rate',
      render: (r) => (
        <div className="text-xs">
          <p className="font-semibold text-[#817A75]">Cost: ₹{r.purchaseRate.toFixed(2)}</p>
          <p className="font-black text-[#FF6A00]">Sell: ₹{r.sellingRate.toFixed(2)}</p>
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stock in Hand',
      render: (r) => {
        const isLow = r.availableStock <= r.minStockAlertLevel
        return (
          <div>
            <span className={`font-black text-sm ${isLow ? 'text-red-700' : 'text-emerald-700'}`}>
              {r.availableStock} <span className="text-xs font-semibold text-[#817A75]">{r.unit}</span>
            </span>
            {isLow && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded-full">
                Low Stock
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <ClayButton
            variant="secondary"
            size="sm"
            onClick={() => {
              setSelectedProduct(r)
              setShowRestockModal(true)
            }}
            leftIcon={<PlusCircle size={13} />}
          >
            Restock
          </ClayButton>
        </div>
      ),
    },
  ]

  // Movement Columns
  const movementCols: Column<FeedStockMovement>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp & Ref',
      render: (r) => (
        <div>
          <span className="font-semibold text-xs text-[#211B18]">
            {new Date(r.timestamp).toLocaleDateString()}
          </span>
          <p className="text-[10px] text-[#817A75] font-mono mt-0.5">{r.referenceId}</p>
        </div>
      ),
    },
    {
      key: 'productName',
      header: 'Product',
      render: (r) => <span className="font-bold text-xs text-[#211B18]">{r.productName}</span>,
    },
    {
      key: 'movementType',
      header: 'Movement Type',
      render: (r) => (
        <ClayBadge variant={r.movementType === 'PURCHASE_RESTOCK' ? 'approved' : 'neutral'}>
          {r.movementType}
        </ClayBadge>
      ),
    },
    {
      key: 'quantity',
      header: 'Change / Resulting',
      render: (r) => (
        <div className="text-xs">
          <span className={`font-bold ${r.quantity > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {r.quantity > 0 ? `+${r.quantity}` : r.quantity}
          </span>
          <p className="text-[10px] text-[#817A75]">Stock: {r.resultingStock}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason / Operator',
      render: (r) => (
        <div className="text-xs">
          <p className="text-[#211B18] font-medium">{r.reason}</p>
          <p className="text-[10px] text-[#817A75]">By: {r.performedBy}</p>
        </div>
      ),
    },
  ]

  // Sales Columns
  const saleCols: Column<CustomerFeedSale>[] = [
    {
      key: 'saleId',
      header: 'Sale ID / Date',
      render: (r) => (
        <div>
          <span className="font-mono font-bold text-xs text-[#211B18]">{r.saleId}</span>
          <p className="text-[10px] text-[#817A75] mt-0.5">{r.purchaseDate}</p>
        </div>
      ),
    },
    {
      key: 'customerName',
      header: 'Farmer Account',
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
      key: 'productName',
      header: 'Item & Quantity',
      render: (r) => (
        <span className="text-xs font-semibold text-[#211B18]">
          {r.quantity} × {r.productName}
        </span>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Total Value',
      render: (r) => (
        <span className="font-black text-xs text-[#FF6A00]">₹{r.totalAmount.toFixed(2)}</span>
      ),
    },
    {
      key: 'paymentMode',
      header: 'Payment Settlement',
      render: (r) => (
        <ClayBadge variant={r.paymentMode === 'LEDGER_DEBIT' ? 'approved' : 'neutral'}>
          {r.paymentMode}
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
            <FeedBagVisual size={28} />
            <h1 className="text-2xl font-black text-[#211B18] tracking-tight">
              Feed Inventory & Sales
            </h1>
          </div>
          <p className="text-xs text-[#817A75] mt-1 font-medium">
            Manage cattle feed stock levels, log restock movements, and record customer purchases with automated ledger debit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <ClayButton
            variant="primary"
            size="sm"
            onClick={() => {
              setSaleCustId(customers[0]?.id || '')
              setSaleProdId(products[0]?.id || '')
              setShowSaleModal(true)
            }}
            leftIcon={<ShoppingCart size={16} />}
          >
            Record Customer Sale
          </ClayButton>
        </div>
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

      {/* Synchronized Inventory Rule */}
      <div className="p-4 bg-white rounded-xl border border-[#F1E7E0] flex items-start gap-3 shadow-xs text-xs text-[#817A75] leading-relaxed">
        <Shield size={18} className="text-[#FF6A00] shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-[#211B18]">Inventory & Ledger Synchronization: </span>
          When selling cattle feed to a farmer with payment mode set to "LEDGER_DEBIT", the product's physical stock is
          instantly reduced, and an auditable debit is created in the farmer's server-authoritative ledger. Unexplained
          stock reductions are prohibited.
        </div>
      </div>

      {/* Tabs */}
      <ClayTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Products Tab */}
      {activeTab === 'products' && (
        <ClayCard className="!p-0 overflow-hidden">
          <ClayTable
            columns={productCols}
            data={products}
            keyExtractor={(p) => p.id}
            isLoading={loadingProducts}
            emptyMessage="No feed products in catalog"
          />
        </ClayCard>
      )}

      {/* Movements Tab */}
      {activeTab === 'movements' && (
        <ClayCard className="!p-0 overflow-hidden">
          <ClayTable
            columns={movementCols}
            data={movements}
            keyExtractor={(m) => m.id}
            isLoading={loadingMovements}
            emptyMessage="No stock movements recorded"
          />
        </ClayCard>
      )}

      {/* Sales Tab */}
      {activeTab === 'sales' && (
        <ClayCard className="!p-0 overflow-hidden">
          <ClayTable
            columns={saleCols}
            data={sales}
            keyExtractor={(s) => s.id}
            isLoading={loadingSales}
            emptyMessage="No feed sales recorded"
          />
        </ClayCard>
      )}

      {/* Restock Modal */}
      {selectedProduct && (
        <ClayModal
          isOpen={showRestockModal}
          onClose={() => setShowRestockModal(false)}
          title={`Restock: ${selectedProduct.name}`}
          subtitle={`Current Available Stock: ${selectedProduct.availableStock} ${selectedProduct.unit}`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const qtyNum = parseInt(restockQty, 10)
              if (isNaN(qtyNum) || qtyNum <= 0) {
                setFormError('Please enter a valid positive quantity')
                return
              }
              if (!restockReason || restockReason.trim().length < 5) {
                setFormError('Authorized reason required (min 5 chars)')
                return
              }
              setFormError('')
              restockMutation.mutate({
                prodId: selectedProduct.id,
                qty: qtyNum,
                reason: restockReason,
              })
            }}
            className="space-y-4 text-left"
          >
            {formError && <ClayAlert type="danger" message={formError} />}

            <ClayInput
              label={`Quantity to Add (${selectedProduct.unit})`}
              type="number"
              min="1"
              value={restockQty}
              onChange={(e) => setRestockQty(e.target.value)}
              required
            />

            <ClayInput
              label="Purchase Reference / Reason"
              placeholder="e.g. Bulk supplier receipt #INV-9821"
              value={restockReason}
              onChange={(e) => setRestockReason(e.target.value)}
              required
            />

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1E7E0]">
              <ClayButton variant="ghost" size="md" type="button" onClick={() => setShowRestockModal(false)}>
                Cancel
              </ClayButton>
              <ClayButton variant="primary" size="md" type="submit" isLoading={restockMutation.isPending}>
                Update Stock In Hand
              </ClayButton>
            </div>
          </form>
        </ClayModal>
      )}

      {/* Record Customer Sale Modal */}
      <ClayModal
        isOpen={showSaleModal}
        onClose={() => setShowSaleModal(false)}
        title="Record Customer Feed Sale"
        subtitle="Deducts inventory stock and debits farmer account ledger"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const qtyNum = parseInt(saleQty, 10)
            if (isNaN(qtyNum) || qtyNum <= 0) {
              setFormError('Please enter a valid positive quantity')
              return
            }
            setFormError('')
            saleMutation.mutate({
              customerId: saleCustId,
              productId: saleProdId,
              quantity: qtyNum,
              paymentMode: salePaymentMode,
              notes: saleNotes,
            })
          }}
          className="space-y-4 text-left"
        >
          {formError && <ClayAlert type="danger" message={formError} />}

          <ClaySelect
            label="Select Farmer"
            options={customers.map((c) => ({ label: `${c.customerCode} — ${c.fullName}`, value: c.id }))}
            value={saleCustId}
            onChange={(e) => setSaleCustId(e.target.value as string)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <ClaySelect
              label="Select Product"
              options={products.map((p) => ({
                label: `${p.name} (Stock: ${p.availableStock} ${p.unit})`,
                value: p.id,
              }))}
              value={saleProdId}
              onChange={(e) => setSaleProdId(e.target.value as string)}
              required
            />

            <ClayInput
              label="Quantity"
              type="number"
              min="1"
              value={saleQty}
              onChange={(e) => setSaleQty(e.target.value)}
              required
            />
          </div>

          <ClaySelect
            label="Payment Mode"
            options={[
              { label: 'Deduct from Milk Settlement Bill (Ledger Debit)', value: 'LEDGER_DEBIT' },
              { label: 'Cash Paid Immediately', value: 'CASH' },
              { label: 'Online UPI Paid', value: 'ONLINE' },
            ]}
            value={salePaymentMode}
            onChange={(e) => setSalePaymentMode(e.target.value as any)}
          />

          <ClayInput
            label="Sale Notes (Optional)"
            placeholder="e.g. Authorized by Shift Supervisor"
            value={saleNotes}
            onChange={(e) => setSaleNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#F1E7E0]">
            <ClayButton variant="ghost" size="md" type="button" onClick={() => setShowSaleModal(false)}>
              Cancel
            </ClayButton>
            <ClayButton variant="primary" size="md" type="submit" isLoading={saleMutation.isPending}>
              Confirm Sale & Post Debit
            </ClayButton>
          </div>
        </form>
      </ClayModal>
    </div>
  )
}
