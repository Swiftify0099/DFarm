import {
  StockMovementType,
  FeedProductUnit,
  FeedPurchaseStatus,
  FeedSaleStatus,
  FeedPaymentMode,
  ReturnStockCondition,
  InventoryAdjustmentType,
} from './enums.js';

export interface FeedCategory {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FeedProduct {
  id: string;
  organizationId: string;
  categoryId: string;
  code: string;
  name: string;
  description?: string | null;
  baseUnit: FeedProductUnit;
  packSize: number;
  packUnit: string;
  defaultPurchasePrice: number;
  sellingPrice: number;
  taxRatePercent: number;
  hsnCode?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
  minimumStockLevel: number;
  weightedAvgCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeedSupplier {
  id: string;
  organizationId: string;
  supplierCode: string;
  name: string;
  contactPerson?: string | null;
  phoneNumber: string;
  email?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  panNumber?: string | null;
  outstandingBalance: number;
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  createdAt: string;
  updatedAt: string;
}

export interface CenterProductInventory {
  id: string;
  organizationId: string;
  centerId: string;
  productId: string;
  currentStock: number;
  reservedStock: number;
  reorderThreshold: number;
  lastMovementAt?: string | null;
  updatedAt: string;
  product?: FeedProduct;
}

export interface FeedPurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  unitCost: number;
  taxRatePercent: number;
  taxAmount: number;
  totalCost: number;
  batchNumber?: string | null;
  expiryDate?: string | null;
  product?: FeedProduct;
}

export interface FeedPurchase {
  id: string;
  organizationId: string;
  centerId: string;
  supplierId: string;
  purchaseOrderNumber?: string | null;
  supplierInvoiceNumber: string;
  purchaseDate: string;
  status: FeedPurchaseStatus;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  idempotencyKey: string;
  createdBy: string;
  receivedBy?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: FeedPurchaseItem[];
  supplier?: FeedSupplier;
}

export interface StockMovement {
  id: string;
  organizationId: string;
  centerId: string;
  productId: string;
  movementType: StockMovementType;
  direction: 'IN' | 'OUT';
  quantity: number;
  quantityDelta: number;
  baseUnit: string;
  balanceAfter: number;
  unitCost?: number | null;
  referenceTransactionType: string;
  referenceId: string;
  batchNumber?: string | null;
  actorId: string;
  approvedBy?: string | null;
  idempotencyKey: string;
  movementTimestamp: string;
  notes?: string | null;
  product?: FeedProduct;
}

export interface FeedSaleItem {
  id: string;
  saleId: string;
  productId: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  unitPrice: number;
  taxRatePercent: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  product?: FeedProduct;
}

export interface FeedSale {
  id: string;
  organizationId: string;
  centerId: string;
  customerId: string;
  invoiceNumber: string;
  receiptNumber: string;
  saleDate: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentMode: FeedPaymentMode;
  status: FeedSaleStatus;
  discountApprovedBy?: string | null;
  idempotencyKey: string;
  clientSaleUuid?: string | null;
  ledgerTransactionId?: string | null;
  syncStatus: 'SYNCED' | 'PENDING_SYNC' | 'CONFLICT';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  items?: FeedSaleItem[];
}

export interface FeedReturn {
  id: string;
  organizationId: string;
  centerId: string;
  saleId: string;
  saleItemId: string;
  customerId: string;
  productId: string;
  returnQuantity: number;
  baseQuantity: number;
  unit: string;
  creditAmount: number;
  stockCondition: ReturnStockCondition;
  reason: string;
  approvedBy: string;
  stockMovementId?: string | null;
  ledgerTransactionId?: string | null;
  idempotencyKey: string;
  returnedAt: string;
  createdAt: string;
}

export interface InventoryTransfer {
  id: string;
  organizationId: string;
  sourceCenterId: string;
  destinationCenterId: string;
  productId: string;
  quantity: number;
  unit: string;
  baseQuantity: number;
  status: 'COMPLETED' | 'CANCELLED';
  sourceMovementId?: string | null;
  destinationMovementId?: string | null;
  initiatedBy: string;
  approvedBy?: string | null;
  transferDate: string;
  notes?: string | null;
  idempotencyKey: string;
}

export interface InventoryAdjustment {
  id: string;
  organizationId: string;
  centerId: string;
  productId: string;
  adjustmentType: InventoryAdjustmentType;
  quantity: number;
  direction: 'IN' | 'OUT';
  reason: string;
  approvedBy: string;
  stockMovementId?: string | null;
  idempotencyKey: string;
  adjustedAt: string;
}

