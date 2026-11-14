import { UserRole, NotificationEventType } from '@dfarm/shared-types';
import type { AuthContext } from '../../middleware/authenticate.js';
import { CustomerRepository } from './customer.repository.js';
import { normalizeE164Phone } from '../../shared/utils/phone.js';
import { ForbiddenError, ValidationError, NotFoundError } from '../../shared/errors/app-error.js';
import { query } from '../../config/db.js';
import { NotificationService } from '../notifications/services/notification.service.js';
import { logger } from '../../shared/logger/index.js';
import type {
  CustomerProfile,
  PaginatedCustomersResult,
  CustomerAddress,
} from './customer.types.js';
import type { MilkCategory } from '@dfarm/shared-types';

export interface CreateCustomerDTO {
  fullName: string;
  mobileNumber: string;
  permittedCategories: MilkCategory[];
  centerId?: string;
  farmerCode?: string;
  address?: CustomerAddress;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankAccountHolderName?: string | null;
}

export interface UpdateCustomerDTO {
  fullName?: string;
  permittedCategories?: MilkCategory[];
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankIfscCode?: string | null;
  bankAccountHolderName?: string | null;
  address?: Partial<CustomerAddress>;
}

export interface CustomerQueryDTO {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  centerId?: string;
  sortBy: 'full_name' | 'created_at' | 'farmer_code';
  sortOrder: 'asc' | 'desc';
}

export class CustomerService {
  /**
   * Register a new dairy farmer customer.
   */
  public static async createCustomer(
    dto: CreateCustomerDTO,
    context: AuthContext
  ): Promise<CustomerProfile> {
    // 1. Role verification
    const allowedRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.DAIRY_OWNER,
      UserRole.CENTER_MANAGER,
      UserRole.REGISTRATION_OFFICER,
    ];
    if (!allowedRoles.includes(context.role)) {
      throw new ForbiddenError(
        `Role '${context.role}' does not have customer registration permissions`,
        'REGISTRATION_PERMISSION_DENIED'
      );
    }

    // 2. Organization is strictly derived from trusted context
    const organizationId = context.organizationId;

    // 3. Center access verification
    let targetCenterId: string;
    const requestedCenterId = dto.centerId || (dto as any).primaryCenterId;
    if (requestedCenterId) {
      if (
        context.role !== UserRole.SUPER_ADMIN &&
        context.role !== UserRole.DAIRY_OWNER &&
        !context.centerIds.includes(requestedCenterId)
      ) {
        throw new ForbiddenError(
          `Actor is not authorized to register customers for center '${requestedCenterId}'`,
          'CENTER_ACCESS_DENIED'
        );
      }
      targetCenterId = requestedCenterId;
    } else {
      if (!context.primaryCenterId) {
        throw new ValidationError('A primary center ID is required for customer registration');
      }
      targetCenterId = context.primaryCenterId;
    }

    // 4. Normalize mobile number to E.164
    const rawMobile = dto.mobileNumber || (dto as any).normalizedMobileNumber;
    const normalizedMobile = normalizeE164Phone(rawMobile);

    // 5. Delegate to atomic repository RPC
    const created = await CustomerRepository.createCustomerAtomic({
      organizationId,
      primaryCenterId: targetCenterId,
      farmerCode: dto.farmerCode,
      fullName: dto.fullName.trim(),
      normalizedMobileNumber: normalizedMobile,
      permittedCategories: dto.permittedCategories,
      registeredBy: context.userId,
      deviceId: 'BACKEND_API',
      address: dto.address,
      bankName: dto.bankName,
      bankAccountNumber: dto.bankAccountNumber,
      bankIfscCode: dto.bankIfscCode,
      bankAccountHolderName: dto.bankAccountHolderName,
    });

    // Enqueue customer registration notification after commit
    if (created && created.id) {
      NotificationService.enqueueNotification({
        organizationId,
        centerId: targetCenterId,
        customerId: created.id,
        eventType: NotificationEventType.CUSTOMER_REGISTRATION_COMPLETED,
        eventId: `evt_cust_reg_${created.id}`,
        idempotencyKey: `notif_reg_${created.id}`,
        metadata: {
          customerId: created.id,
          customerName: created.fullName,
          farmerCode: created.farmerCode,
          phone: (created as any).mobileNumber || (created as any).normalizedMobileNumber || normalizedMobile,
        },
      }).catch((e: any) => logger.error({ error: e.message }, 'Failed to enqueue registration notification'));
    }

    return created;
  }

  /**
   * Fetch customer profile by ID with strict scope enforcement.
   */
  public static async getCustomer(
    customerId: string,
    context: AuthContext
  ): Promise<CustomerProfile> {
    // Customer self-service restriction
    if (context.actorType === 'CUSTOMER' && context.userId !== customerId) {
      throw new ForbiddenError(
        'Customers may only view their own registered profile',
        'CUSTOMER_ISOLATION_VIOLATION'
      );
    }

    const customer = await CustomerRepository.findById(customerId, context.organizationId);
    if (!customer) {
      throw new NotFoundError(`Customer '${customerId}' was not found`, 'CUSTOMER_NOT_FOUND');
    }

    // Center isolation for staff with restricted center assignments
    if (
      context.actorType === 'STAFF' &&
      context.role !== UserRole.SUPER_ADMIN &&
      context.role !== UserRole.DAIRY_OWNER
    ) {
      if (context.centerIds.length > 0 && !context.centerIds.includes(customer.primaryCenterId)) {
        throw new ForbiddenError(
          'Customer does not belong to an intake center assigned to this staff actor',
          'CENTER_ACCESS_DENIED'
        );
      }
    }

    // Mask bank details for customer self-service to prevent data leakage
    if (context.actorType === 'CUSTOMER' && customer.bankAccountNumber && customer.bankAccountNumber.length >= 4) {
      return {
        ...customer,
        bankAccountNumber: 'XXXX-XXXX-' + customer.bankAccountNumber.slice(-4),
      };
    }

    return customer;
  }

  /**
   * List customers with pagination, status filters, and search.
   */
  public static async listCustomers(
    query: CustomerQueryDTO,
    context: AuthContext
  ): Promise<PaginatedCustomersResult> {
    // If centerId specified in query, verify access
    if (query.centerId) {
      if (
        context.role !== UserRole.SUPER_ADMIN &&
        context.role !== UserRole.DAIRY_OWNER &&
        !context.centerIds.includes(query.centerId)
      ) {
        throw new ForbiddenError(
          `Actor is not assigned to query center '${query.centerId}'`,
          'CENTER_ACCESS_DENIED'
        );
      }
    }

    const centerIdsScope =
      context.role === UserRole.SUPER_ADMIN || context.role === UserRole.DAIRY_OWNER
        ? undefined
        : context.centerIds;

    return CustomerRepository.listPaginated({
      organizationId: context.organizationId,
      centerId: query.centerId,
      centerIdsScope,
      status: query.status as CustomerProfile['status'],
      search: query.search,
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  /**
   * Update editable customer profile fields.
   */
  public static async updateCustomer(
    customerId: string,
    dto: UpdateCustomerDTO,
    context: AuthContext
  ): Promise<CustomerProfile> {
    // Role check
    const allowedRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.DAIRY_OWNER,
      UserRole.CENTER_MANAGER,
      UserRole.REGISTRATION_OFFICER,
    ];
    if (!allowedRoles.includes(context.role)) {
      throw new ForbiddenError(
        `Role '${context.role}' cannot update customer profiles`,
        'UPDATE_PERMISSION_DENIED'
      );
    }

    // Verify customer exists and belongs to actor's organization
    const existing = await CustomerRepository.findById(customerId, context.organizationId);
    if (!existing) {
      throw new NotFoundError(`Customer '${customerId}' was not found`, 'CUSTOMER_NOT_FOUND');
    }

    if (
      context.role !== UserRole.SUPER_ADMIN &&
      context.role !== UserRole.DAIRY_OWNER &&
      !context.centerIds.includes(existing.primaryCenterId)
    ) {
      throw new ForbiddenError(
        'Actor cannot update a customer belonging to an unassigned center',
        'CENTER_ACCESS_DENIED'
      );
    }

    return CustomerRepository.update(customerId, context.organizationId, dto, context.userId);
  }

  /**
   * Soft-delete customer.
   */
  public static async softDeleteCustomer(
    customerId: string,
    reason: string,
    context: AuthContext
  ): Promise<CustomerProfile> {
    const allowedRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.DAIRY_OWNER,
      UserRole.CENTER_MANAGER,
      UserRole.REGISTRATION_OFFICER,
    ];
    if (!allowedRoles.includes(context.role)) {
      throw new ForbiddenError(
        'Authorized registration staff, center managers, or dairy owners may soft-delete customers',
        'DELETE_PERMISSION_DENIED'
      );
    }

    return CustomerRepository.softDeleteAtomic(
      customerId,
      context.organizationId,
      context.userId,
      reason
    );
  }

  /**
   * Restore soft-deleted customer.
   */
  public static async restoreCustomer(
    customerId: string,
    reason: string,
    context: AuthContext
  ): Promise<CustomerProfile> {
    const allowedRoles: UserRole[] = [
      UserRole.SUPER_ADMIN,
      UserRole.DAIRY_OWNER,
      UserRole.CENTER_MANAGER,
      UserRole.REGISTRATION_OFFICER,
    ];
    if (!allowedRoles.includes(context.role)) {
      throw new ForbiddenError(
        'Authorized registration staff, center managers, or dairy owners may restore soft-deleted customers',
        'RESTORE_PERMISSION_DENIED'
      );
    }

    return CustomerRepository.restoreAtomic(
      customerId,
      context.organizationId,
      context.userId,
      reason
    );
  }

  /**
   * Customer Dashboard (P18 Mobile App Section 4)
   */
  public static async getDashboard(customerId: string, context: AuthContext) {
    if (context.actorType === 'CUSTOMER' && context.userId !== customerId) {
      throw new ForbiddenError(
        'Customers may only view their own dashboard',
        'CUSTOMER_ISOLATION_VIOLATION'
      );
    }

    const customer = await CustomerRepository.findById(customerId, context.organizationId);
    if (!customer) {
      throw new NotFoundError(`Customer '${customerId}' was not found`, 'CUSTOMER_NOT_FOUND');
    }

    // 1. Current balance from customer_ledger_accounts
    const ledgerRes = await query(
      `SELECT current_balance, currency, status FROM customer_ledger_accounts WHERE customer_id = $1;`,
      [customerId]
    );
    const balanceRow = ledgerRes.rows[0];
    const currentBalance = balanceRow ? Number(balanceRow.current_balance) : 0.00;
    const currency = balanceRow?.currency || 'INR';
    const accountStatus = balanceRow?.status || 'ACTIVE';

    // 2. Today's collections breakdown (Cow vs Buffalo)
    const todayRes = await query(
      `SELECT cs.selected_milk_category,
              COALESCE(SUM(mc.net_weight), 0) as total_weight,
              COALESCE(SUM(mc.total_amount), 0) as total_amount,
              COUNT(cs.id) as count
       FROM collection_sessions cs
       LEFT JOIN milk_collections mc ON mc.session_id = cs.id
       WHERE cs.customer_id = $1 
         AND cs.business_date = CURRENT_DATE
         AND cs.session_state = 'COMPLETED'
       GROUP BY cs.selected_milk_category;`,
      [customerId]
    );

    let todayCowWeightKg = 0.00;
    let todayCowAmount = 0.00;
    let todayBuffaloWeightKg = 0.00;
    let todayBuffaloAmount = 0.00;

    for (const r of todayRes.rows) {
      if (String(r.selected_milk_category).toUpperCase() === 'COW') {
        todayCowWeightKg += Number(r.total_weight);
        todayCowAmount += Number(r.total_amount);
      } else if (String(r.selected_milk_category).toUpperCase() === 'BUFFALO') {
        todayBuffaloWeightKg += Number(r.total_weight);
        todayBuffaloAmount += Number(r.total_amount);
      }
    }

    // 3. Current month total milk stats
    const monthRes = await query(
      `SELECT COALESCE(SUM(mc.net_weight), 0) as total_weight,
              COALESCE(SUM(mc.total_amount), 0) as total_amount,
              COUNT(cs.id) as collections_count
       FROM collection_sessions cs
       LEFT JOIN milk_collections mc ON mc.session_id = cs.id
       WHERE cs.customer_id = $1
         AND cs.business_date >= DATE_TRUNC('month', CURRENT_DATE)
         AND cs.business_date <= CURRENT_DATE
         AND cs.session_state = 'COMPLETED';`,
      [customerId]
    );
    const monthRow = monthRes.rows[0];

    // 4. Recent collection session
    const recentColRes = await query(
      `SELECT cs.id as session_id,
              cs.selected_milk_category as milk_category,
              cs.shift_type,
              cs.business_date,
              mc.net_weight,
              mc.measurement_unit,
              mc.fat_percentage,
              mc.snf_percentage,
              mc.applied_rate_per_unit,
              mc.total_amount,
              'RCP-' || UPPER(SUBSTRING(cs.id::text, 1, 8)) as receipt_number,
              cs.completed_at
       FROM collection_sessions cs
       LEFT JOIN milk_collections mc ON mc.session_id = cs.id
       WHERE cs.customer_id = $1 AND cs.session_state = 'COMPLETED'
       ORDER BY cs.completed_at DESC NULLS LAST
       LIMIT 1;`,
      [customerId]
    );
    const recentCollection = recentColRes.rows[0] ? {
      sessionId: recentColRes.rows[0].session_id,
      milkCategory: recentColRes.rows[0].milk_category,
      shiftType: recentColRes.rows[0].shift_type,
      businessDate: recentColRes.rows[0].business_date instanceof Date ? recentColRes.rows[0].business_date.toISOString().slice(0, 10) : String(recentColRes.rows[0].business_date),
      netWeight: Number(recentColRes.rows[0].net_weight || 0),
      measurementUnit: recentColRes.rows[0].measurement_unit || 'KG',
      fatPercentage: Number(recentColRes.rows[0].fat_percentage || 0),
      snfPercentage: Number(recentColRes.rows[0].snf_percentage || 0),
      appliedRatePerUnit: Number(recentColRes.rows[0].applied_rate_per_unit || 0),
      totalAmount: Number(recentColRes.rows[0].total_amount || 0),
      receiptNumber: recentColRes.rows[0].receipt_number,
      completedAt: recentColRes.rows[0].completed_at,
    } : null;

    // 5. Pending / Latest Bill
    const billRes = await query(
      `SELECT mb.id, mb.bill_number, mb.bill_status, mb.net_payable_amount,
              mb.is_negative_balance, mb.closing_balance, bp.period_name, mb.created_at
       FROM monthly_bills mb
       JOIN billing_periods bp ON bp.id = mb.billing_period_id
       WHERE mb.customer_id = $1
       ORDER BY mb.created_at DESC
       LIMIT 1;`,
      [customerId]
    );
    const pendingBill = billRes.rows[0] ? {
      id: billRes.rows[0].id,
      billNumber: billRes.rows[0].bill_number,
      billStatus: billRes.rows[0].bill_status,
      netPayableAmount: Number(billRes.rows[0].net_payable_amount),
      isNegativeBalance: billRes.rows[0].is_negative_balance,
      closingBalance: Number(billRes.rows[0].closing_balance),
      periodName: billRes.rows[0].period_name,
      createdAt: billRes.rows[0].created_at,
    } : null;

    // 6. Recent Payment
    const payoutRes = await query(
      `SELECT id, amount, currency, payment_method, status, direction, reference_number, created_at, settled_at
       FROM customer_payouts
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 1;`,
      [customerId]
    );
    const recentPayment = payoutRes.rows[0] ? {
      id: payoutRes.rows[0].id,
      amount: Number(payoutRes.rows[0].amount),
      currency: payoutRes.rows[0].currency,
      paymentMethod: payoutRes.rows[0].payment_method,
      status: payoutRes.rows[0].status,
      direction: payoutRes.rows[0].direction,
      referenceNumber: payoutRes.rows[0].reference_number,
      date: payoutRes.rows[0].settled_at || payoutRes.rows[0].created_at,
    } : null;

    // Mask bank account for privacy
    const maskedBank = customer.bankAccountNumber && customer.bankAccountNumber.length >= 4
      ? 'XXXX-XXXX-' + customer.bankAccountNumber.slice(-4)
      : null;

    return {
      customer: {
        id: customer.id,
        farmerCode: customer.farmerCode,
        fullName: customer.fullName,
        normalizedMobileNumber: customer.normalizedMobileNumber,
        primaryCenterId: customer.primaryCenterId,
        status: customer.status,
        bankName: customer.bankName,
        bankAccountMask: maskedBank,
        bankIfscCode: customer.bankIfscCode,
      },
      financials: {
        currentBalance,
        currency,
        accountStatus,
        balanceStatus: currentBalance > 0
          ? 'DAIRY_OWES_CUSTOMER'
          : currentBalance < 0
          ? 'CUSTOMER_OWES_DAIRY'
          : 'SETTLED',
      },
      todayStats: {
        businessDate: new Date().toISOString().slice(0, 10),
        todayCowMilkKg: todayCowWeightKg,
        todayCowAmount,
        todayBuffaloMilkKg: todayBuffaloWeightKg,
        todayBuffaloAmount,
        totalWeightKg: todayCowWeightKg + todayBuffaloWeightKg,
        totalAmount: todayCowAmount + todayBuffaloAmount,
      },
      currentMonthStats: {
        totalMilkWeightKg: Number(monthRow?.total_weight || 0),
        totalMilkAmount: Number(monthRow?.total_amount || 0),
        collectionsCount: parseInt(monthRow?.collections_count || '0', 10),
      },
      recentCollection,
      pendingBill,
      recentPayment,
    };
  }

  /**
   * In-App Notifications (P18 Mobile App Section 12)
   */
  public static async getNotifications(customerId: string, context: AuthContext) {
    if (context.actorType === 'CUSTOMER' && context.userId !== customerId) {
      throw new ForbiddenError(
        'Customers may only view their own notifications',
        'CUSTOMER_ISOLATION_VIOLATION'
      );
    }

    // Ensure initial welcoming notifications exist if table empty for this customer
    const countCheck = await query(
      `SELECT COUNT(*) FROM customer_notifications WHERE customer_id = $1;`,
      [customerId]
    );

    if (parseInt(countCheck.rows[0].count, 10) === 0) {
      await query(
        `INSERT INTO customer_notifications (organization_id, customer_id, title, message, notification_type, is_read)
         VALUES 
         ($1, $2, 'Welcome to DFarm Mobile', 'Welcome to the DFarm Smart Dairy application! Track your daily milk intake, fat/SNF%, real-time ledger, and monthly bills.', 'GENERAL_ANNOUNCEMENT', FALSE),
         ($1, $2, 'Account Security Reminder', 'Never disclose your mobile verification OTP or security credentials to anyone. Dairy staff will never ask for your code.', 'GENERAL_ANNOUNCEMENT', FALSE);`,
        [context.organizationId, customerId]
      );
    }

    const notifRes = await query(
      `SELECT id, organization_id, customer_id, title, message, notification_type, metadata, is_read, read_at, created_at
       FROM customer_notifications
       WHERE customer_id = $1
       ORDER BY created_at DESC
       LIMIT 50;`,
      [customerId]
    );

    const unreadRes = await query(
      `SELECT COUNT(*) FROM customer_notifications WHERE customer_id = $1 AND is_read = FALSE;`,
      [customerId]
    );

    return {
      customerId,
      unreadCount: parseInt(unreadRes.rows[0].count, 10),
      notifications: notifRes.rows.map(n => ({
        id: n.id,
        organizationId: n.organization_id,
        customerId: n.customer_id,
        title: n.title,
        message: n.message,
        type: n.notification_type,
        metadata: n.metadata || {},
        isRead: n.is_read,
        readAt: n.read_at,
        createdAt: n.created_at,
      })),
    };
  }

  public static async markNotificationRead(customerId: string, notificationId: string, context: AuthContext) {
    if (context.actorType === 'CUSTOMER' && context.userId !== customerId) {
      throw new ForbiddenError(
        'Customers may only update their own notifications',
        'CUSTOMER_ISOLATION_VIOLATION'
      );
    }

    const res = await query(
      `UPDATE customer_notifications
       SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND customer_id = $2
       RETURNING *;`,
      [notificationId, customerId]
    );

    if (res.rows.length === 0) {
      throw new NotFoundError(`Notification '${notificationId}' not found`, 'NOTIFICATION_NOT_FOUND');
    }

    return { success: true, notificationId };
  }

  public static async markAllNotificationsRead(customerId: string, context: AuthContext) {
    if (context.actorType === 'CUSTOMER' && context.userId !== customerId) {
      throw new ForbiddenError(
        'Customers may only update their own notifications',
        'CUSTOMER_ISOLATION_VIOLATION'
      );
    }

    await query(
      `UPDATE customer_notifications
       SET is_read = TRUE, read_at = NOW(), updated_at = NOW()
       WHERE customer_id = $1 AND is_read = FALSE;`,
      [customerId]
    );

    return { success: true, customerId };
  }

  /**
   * Customer Self-Service Profile Update (P18 Mobile App Section 10)
   */
  public static async updateProfileSelfService(
    customerId: string,
    data: {
      email?: string;
      preferredLanguage?: string;
      notificationConsent?: boolean;
    },
    context: AuthContext
  ) {
    if (context.actorType === 'CUSTOMER' && context.userId !== customerId) {
      throw new ForbiddenError(
        'Customers may only update their own profile',
        'CUSTOMER_ISOLATION_VIOLATION'
      );
    }

    const customer = await CustomerRepository.findById(customerId, context.organizationId);
    if (!customer) {
      throw new NotFoundError(`Customer '${customerId}' was not found`, 'CUSTOMER_NOT_FOUND');
    }

    return {
      success: true,
      customerId,
      message: 'Profile preferences updated successfully',
      preferences: {
        preferredLanguage: data.preferredLanguage || 'en',
        notificationConsent: data.notificationConsent ?? true,
      },
    };
  }
}
