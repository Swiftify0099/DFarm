import { FeedRepository } from './feed.repository.js';
import { AuthContext } from '../../middleware/authenticate.js';
import { UserRole, NotificationEventType } from '@dfarm/shared-types';
import { NotificationService } from '../notifications/services/notification.service.js';
import { logger } from '../../shared/logger/index.js';
import {
  ForbiddenError,
  BadRequestError,
  NotFoundError,
  ConflictError,
} from '../../shared/errors/app-error.js';

export class FeedService {
  // ==========================================================================
  // Categories
  // ==========================================================================

  public static async createCategory(data: any, auth: AuthContext) {
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN &&
      auth.role !== UserRole.INVENTORY_MANAGER
    ) {
      throw new ForbiddenError('Unauthorized to create feed categories');
    }
    return FeedRepository.createCategory(auth.organizationId, data);
  }

  public static async getCategories(auth: AuthContext) {
    return FeedRepository.getCategories(auth.organizationId);
  }

  // ==========================================================================
  // Products
  // ==========================================================================

  public static async createProduct(data: any, auth: AuthContext) {
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN &&
      auth.role !== UserRole.INVENTORY_MANAGER
    ) {
      throw new ForbiddenError('Unauthorized to create feed products');
    }

    if (data.sellingPrice < 0) {
      throw new BadRequestError('Selling price cannot be negative');
    }
    if (data.defaultPurchasePrice < 0) {
      throw new BadRequestError('Purchase price cannot be negative');
    }
    if (data.packSize <= 0) {
      throw new BadRequestError('Pack size must be greater than zero');
    }

    return FeedRepository.createProduct(auth.organizationId, data);
  }

  public static async updateProduct(productId: string, data: any, auth: AuthContext) {
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN &&
      auth.role !== UserRole.INVENTORY_MANAGER
    ) {
      throw new ForbiddenError('Unauthorized to update feed products');
    }

    if (data.sellingPrice !== undefined && data.sellingPrice < 0) {
      throw new BadRequestError('Selling price cannot be negative');
    }
    if (data.defaultPurchasePrice !== undefined && data.defaultPurchasePrice < 0) {
      throw new BadRequestError('Purchase price cannot be negative');
    }

    return FeedRepository.updateProduct(auth.organizationId, productId, data);
  }

  public static async getProductById(productId: string, auth: AuthContext) {
    return FeedRepository.getProductById(auth.organizationId, productId);
  }

  public static async getProducts(filters: any, auth: AuthContext) {
    return FeedRepository.getProducts(auth.organizationId, filters);
  }

  // ==========================================================================
  // Suppliers
  // ==========================================================================

  public static async createSupplier(data: any, auth: AuthContext) {
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN &&
      auth.role !== UserRole.INVENTORY_MANAGER
    ) {
      throw new ForbiddenError('Unauthorized to register feed suppliers');
    }
    return FeedRepository.createSupplier(auth.organizationId, data);
  }

  public static async getSuppliers(auth: AuthContext) {
    return FeedRepository.getSuppliers(auth.organizationId);
  }

  // ==========================================================================
  // Purchases & Receiving
  // ==========================================================================

  public static async createPurchase(data: any, auth: AuthContext) {
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN &&
      auth.role !== UserRole.INVENTORY_MANAGER
    ) {
      throw new ForbiddenError('Unauthorized to record feed purchases');
    }

    // Verify center access
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN
    ) {
      if (!auth.centerIds.includes(data.centerId)) {
        throw new ForbiddenError(`No permission to purchase for center '${data.centerId}'`);
      }
    }

    return FeedRepository.createPurchase(auth.organizationId, auth.userId, data);
  }

  public static async receivePurchase(purchaseId: string, data: any, auth: AuthContext) {
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN &&
      auth.role !== UserRole.INVENTORY_MANAGER &&
      auth.role !== UserRole.CENTER_MANAGER
    ) {
      throw new ForbiddenError('Unauthorized to receive stock purchases');
    }

    const purchase = await FeedRepository.getPurchaseById(auth.organizationId, purchaseId);
    if (!purchase) {
      throw new NotFoundError(`Purchase '${purchaseId}' not found`);
    }

    if (purchase.status === 'RECEIVED') {
      throw new ConflictError(`Purchase '${purchaseId}' has already been received and cannot be received again`);
    }

    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN
    ) {
      if (!auth.centerIds.includes(purchase.centerId)) {
        throw new ForbiddenError(`No permission to receive stock for center '${purchase.centerId}'`);
      }
    }

    return FeedRepository.receivePurchase(purchaseId, auth.userId, data.idempotencyKey);
  }

  // ==========================================================================
  // Inventory, Transfers & Adjustments
  // ==========================================================================

  public static async getInventory(centerId: string | undefined, productId: string | undefined, auth: AuthContext) {
    // If center specified, check center access
    if (
      centerId &&
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN
    ) {
      if (!auth.centerIds.includes(centerId)) {
        throw new ForbiddenError(`No permission to view inventory for center '${centerId}'`);
      }
    }

    // If center not specified and not owner/admin, default to first assigned center or reject cross-center read
    let targetCenterId = centerId;
    if (
      !targetCenterId &&
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN
    ) {
      targetCenterId = auth.primaryCenterId || auth.centerIds[0];
    }

    return FeedRepository.getCenterInventory(auth.organizationId, targetCenterId, productId);
  }

  public static async getMovements(filters: any, auth: AuthContext) {
    if (
      filters?.centerId &&
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN
    ) {
      if (!auth.centerIds.includes(filters.centerId)) {
        throw new ForbiddenError(`No permission to view movements for center '${filters.centerId}'`);
      }
    }

    return FeedRepository.getStockMovements(auth.organizationId, filters);
  }

  public static async transferStock(data: any, auth: AuthContext) {
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN &&
      auth.role !== UserRole.INVENTORY_MANAGER &&
      auth.role !== UserRole.CENTER_MANAGER
    ) {
      throw new ForbiddenError('Unauthorized to initiate inventory transfers');
    }

    // Check source center access
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN
    ) {
      if (!auth.centerIds.includes(data.sourceCenterId)) {
        throw new ForbiddenError(`No permission to transfer from source center '${data.sourceCenterId}'`);
      }
    }

    return FeedRepository.transferStock(
      auth.organizationId,
      data.sourceCenterId,
      data.destinationCenterId,
      data.productId,
      data.quantity,
      data.unit,
      auth.userId,
      auth.userId,
      data.idempotencyKey,
      data.notes
    );
  }

  public static async adjustStock(data: any, auth: AuthContext) {
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN &&
      auth.role !== UserRole.INVENTORY_MANAGER
    ) {
      throw new ForbiddenError('Unauthorized to approve inventory adjustments or write-offs');
    }

    return FeedRepository.adjustStock(
      auth.organizationId,
      data.centerId,
      data.productId,
      data.adjustmentType,
      data.quantity,
      data.direction,
      data.reason,
      auth.userId,
      data.idempotencyKey
    );
  }

  // ==========================================================================
  // Customer Sales & Returns
  // ==========================================================================

  public static async createSale(data: any, auth: AuthContext) {
    // Check role: Owner, Admin, Center Manager, Inventory Manager, Operator
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN &&
      auth.role !== UserRole.CENTER_MANAGER &&
      auth.role !== UserRole.INVENTORY_MANAGER &&
      auth.role !== UserRole.COLLECTION_OPERATOR
    ) {
      throw new ForbiddenError('Unauthorized to process customer feed sales');
    }

    // Check center access
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN
    ) {
      if (!auth.centerIds.includes(data.centerId)) {
        throw new ForbiddenError(`No permission to sell from center '${data.centerId}'`);
      }
    }

    // Discount check
    if (data.discountAmount && data.discountAmount > 0) {
      if (!data.discountApprovedBy) {
        throw new BadRequestError('Discount approval required');
      }
    }

    const sale = await FeedRepository.createSale(
      auth.organizationId,
      data.centerId,
      data.customerId,
      auth.userId,
      data.paymentMode || 'CREDIT',
      data.items,
      data.discountAmount || 0,
      data.discountApprovedBy || null,
      data.idempotencyKey,
      data.clientSaleUuid
    );

    if (sale && (sale.saleId || sale.id)) {
      const saleId = sale.saleId || sale.id;
      NotificationService.enqueueNotification({
        organizationId: auth.organizationId,
        centerId: data.centerId,
        customerId: data.customerId,
        eventType: NotificationEventType.FEED_PURCHASE_COMPLETED,
        eventId: `evt_feed_sale_${saleId}`,
        idempotencyKey: `notif_feed_${saleId}`,
        metadata: {
          saleId,
          receiptNumber: sale.invoiceNumber || sale.receiptNumber || 'FS-REC',
          productName: data.items?.[0]?.productName || 'Cattle Feed',
          quantity: data.items?.[0]?.quantity || 1,
          unit: 'BAG',
          unitPrice: data.items?.[0]?.unitPrice || sale.netPayableAmount || 0,
          totalAmount: sale.netPayableAmount || sale.totalAmount || 0,
          paymentMode: data.paymentMode || 'CREDIT',
          balance: sale.balanceAfter || 0,
        },
      }).catch(e => logger.error({ error: e.message }, 'Failed to enqueue feed purchase notification'));
    }

    return sale;
  }

  public static async getSales(filters: any, auth: AuthContext) {
    if (auth.actorType === 'CUSTOMER') {
      filters.customerId = auth.userId;
    } else if (
      filters?.centerId &&
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN
    ) {
      if (!auth.centerIds.includes(filters.centerId)) {
        throw new ForbiddenError(`No permission to view sales for center '${filters.centerId}'`);
      }
    }

    return FeedRepository.getSales(auth.organizationId, filters);
  }

  public static async getSaleById(saleId: string, auth: AuthContext) {
    const sale = await FeedRepository.getSaleById(auth.organizationId, saleId);
    if (!sale) {
      throw new NotFoundError(`Feed sale '${saleId}' not found`);
    }

    if (auth.actorType === 'CUSTOMER' && sale.customerId !== auth.userId) {
      throw new ForbiddenError('Customers may only view their own feed sale invoices');
    }

    return sale;
  }

  public static async processReturn(saleId: string, data: any, auth: AuthContext) {
    if (
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN &&
      auth.role !== UserRole.CENTER_MANAGER &&
      auth.role !== UserRole.INVENTORY_MANAGER
    ) {
      throw new ForbiddenError('Unauthorized to approve customer feed returns');
    }

    return FeedRepository.processReturn(
      auth.organizationId,
      saleId,
      data.saleItemId,
      data.returnQuantity,
      data.stockCondition,
      data.reason,
      auth.userId,
      data.idempotencyKey
    );
  }

  // ==========================================================================
  // Inventory Reports
  // ==========================================================================

  public static async getReports(query: any, auth: AuthContext) {
    const reportType = query.type || 'current-stock';
    const centerId = query.centerId;

    if (
      centerId &&
      auth.role !== UserRole.SUPER_ADMIN &&
      auth.role !== UserRole.DAIRY_OWNER &&
      auth.role !== (UserRole as any).DAIRY_ADMIN
    ) {
      if (!auth.centerIds.includes(centerId)) {
        throw new ForbiddenError(`No permission to view reports for center '${centerId}'`);
      }
    }

    switch (reportType) {
      case 'low-stock':
        return FeedRepository.getLowStockReport(auth.organizationId, centerId);

      case 'valuation':
        return FeedRepository.getStockValuationReport(auth.organizationId, centerId);

      case 'daily-summary': {
        const startDate = query.startDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
        const endDate = query.endDate || new Date().toISOString().split('T')[0];
        return FeedRepository.getDailySalesPurchasesReport(auth.organizationId, startDate, endDate, centerId);
      }

      case 'current-stock':
      default:
        return FeedRepository.getCenterInventory(auth.organizationId, centerId);
    }
  }
}
