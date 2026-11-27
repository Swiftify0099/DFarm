import crypto from 'node:crypto';
import { ILedgerRepository, LedgerSaveActorOptions } from '../../application/ports/index.js';
import { CustomerLedgerAccount, LedgerEntry } from '../../domain/entities/CustomerLedgerAccount.js';
import {
  CustomerNotFoundError,
  DomainValidationError,
  ForbiddenError,
  ForbiddenTenantError,
} from '../../domain/errors/index.js';
import {
  IDatabaseClient,
  tenantDbManager,
  TenantDatabaseUnavailableError,
} from '../database/TenantDatabaseManager.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PostgresLedgerRepository implements ILedgerRepository {
  private assertValidOrganizationId(organizationId?: string): string {
    if (!organizationId || typeof organizationId !== 'string' || !organizationId.trim()) {
      throw new DomainValidationError(
        'Authenticated organization ID is strictly required for ledger operations.',
        'MISSING_ORGANIZATION_ID'
      );
    }
    const cleanOrgId = organizationId.trim();
    if (!UUID_REGEX.test(cleanOrgId)) {
      throw new DomainValidationError(
        'Invalid organization ID format for ledger operation.',
        'INVALID_ORGANIZATION_ID'
      );
    }
    return cleanOrgId;
  }

  private async getAuthorizedTenantDb(organizationId?: string): Promise<{ orgId: string; tenantDb: IDatabaseClient }> {
    const orgId = this.assertValidOrganizationId(organizationId);
    const tenantDb = await tenantDbManager.getStrictTenantDb(orgId);
    return { orgId, tenantDb };
  }

  private isConstraintOrDomainError(err: any): boolean {
    const pgCode = err?.code;
    return (
      pgCode === '23505' ||
      pgCode === '23503' ||
      pgCode === '23514' ||
      pgCode === '22P02' ||
      err instanceof DomainValidationError ||
      err instanceof ForbiddenError ||
      err instanceof ForbiddenTenantError ||
      err instanceof CustomerNotFoundError
    );
  }

  private async queryTenant<T extends Record<string, any> = any>(
    client: { query: (text: string, params?: any[]) => Promise<{ rows: T[] }> },
    organizationId: string,
    sql: string,
    params: any[]
  ): Promise<{ rows: T[] }> {
    try {
      return await client.query(sql, params);
    } catch (err: any) {
      if (err instanceof TenantDatabaseUnavailableError || this.isConstraintOrDomainError(err)) {
        throw err;
      }
      throw new TenantDatabaseUnavailableError(
        organizationId,
        'QUERY_FAILED',
        'Tenant ledger database query failed'
      );
    }
  }

  private async validateCustomerCenterAndOperator(
    txClient: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> },
    params: {
      organizationId: string;
      customerId: string;
      operatorId?: string;
    }
  ): Promise<{ customerId: string; centerId: string; operatorId?: string }> {
    const { organizationId, customerId, operatorId } = params;

    if (!customerId || !UUID_REGEX.test(customerId)) {
      throw new DomainValidationError('Valid customer ID is required for ledger operations.', 'INVALID_CUSTOMER_ID');
    }

    // 1. Validate customer exists in selected tenant DB and belongs to organization
    const custRes = await this.queryTenant<{
      id: string;
      organization_id: string;
      primary_center_id: string | null;
      is_deleted: boolean;
    }>(
      txClient,
      organizationId,
      `SELECT id, organization_id, primary_center_id, is_deleted
       FROM customers
       WHERE id = $1
       LIMIT 1;`,
      [customerId]
    );
    if (custRes.rows.length === 0) {
      throw new CustomerNotFoundError(customerId);
    }
    const cust = custRes.rows[0]!;
    if (String(cust.organization_id || '').toLowerCase() !== organizationId.toLowerCase()) {
      throw new ForbiddenTenantError(
        `Cross-tenant customer '${customerId}' does not belong to organization '${organizationId}'.`
      );
    }
    if (cust.is_deleted) {
      throw new DomainValidationError(`Customer '${customerId}' is deleted.`, 'CUSTOMER_DELETED');
    }

    // 2. Validate customer's center exists and belongs to organization (never fabricate default center)
    const centerId = cust.primary_center_id;
    if (!centerId || !UUID_REGEX.test(centerId)) {
      throw new DomainValidationError(
        `Customer '${customerId}' has no valid primary center in organization '${organizationId}'.`,
        'INVALID_CENTER'
      );
    }
    const centerRes = await this.queryTenant<{ id: string; organization_id: string; status: string }>(
      txClient,
      organizationId,
      `SELECT id, organization_id, status FROM dairy_centers WHERE id = $1 LIMIT 1;`,
      [centerId]
    );
    if (centerRes.rows.length === 0) {
      throw new DomainValidationError(
        `Center '${centerId}' does not exist in tenant database.`,
        'INVALID_CENTER'
      );
    }
    if (String(centerRes.rows[0]!.organization_id || '').toLowerCase() !== organizationId.toLowerCase()) {
      throw new ForbiddenTenantError(
        `Cross-tenant center '${centerId}' does not belong to organization '${organizationId}'.`
      );
    }

    // 3. Validate real authorized operator if writing a ledger journal entry (never pick random user or fabricate)
    if (operatorId !== undefined) {
      if (!operatorId || !UUID_REGEX.test(operatorId)) {
        throw new DomainValidationError(
          'Valid authenticated operator ID is required for ledger transactions.',
          'INVALID_OPERATOR'
        );
      }
      const userRes = await this.queryTenant<{
        id: string;
        organization_id: string | null;
        role: string | null;
        status: string;
      }>(
        txClient,
        organizationId,
        `SELECT id, organization_id, role, status
         FROM users
         WHERE id = $1
         LIMIT 1;`,
        [operatorId]
      );
      if (userRes.rows.length === 0) {
        throw new DomainValidationError(
          `Authoritative operator '${operatorId}' does not exist in tenant database.`,
          'INVALID_OPERATOR'
        );
      }
      const op = userRes.rows[0]!;
      const effRole = String(op.role || '').trim().toUpperCase();
      if (!effRole || effRole === 'FARMER_CUSTOMER' || effRole === 'GUEST_FARMER' || effRole === 'CUSTOMER') {
        throw new ForbiddenError(`User '${operatorId}' is not authorized to post ledger transactions.`, 'UNAUTHORIZED_OPERATOR');
      }
      if (String(op.status || '').toUpperCase() !== 'ACTIVE') {
        throw new ForbiddenError(`Operator '${operatorId}' is not ACTIVE.`, 'OPERATOR_INACTIVE');
      }
      if (
        effRole !== 'SUPER_ADMIN' &&
        effRole !== 'PLATFORM_OPERATOR' &&
        String(op.organization_id || '').toLowerCase() !== organizationId.toLowerCase()
      ) {
        throw new ForbiddenTenantError(
          `Cross-tenant operator '${operatorId}' does not belong to organization '${organizationId}'.`
        );
      }
    }

    return { customerId: cust.id, centerId, operatorId };
  }

  private async lockOrCreateLedgerAccount(
    txClient: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> },
    orgId: string,
    customerId: string,
    preferredAccountId?: string,
    initialBalance = 0.0
  ): Promise<{ accountId: string; currentBalance: number }> {
    const accRes = await this.queryTenant<{ id: string; organization_id: string; current_balance: string | number }>(
      txClient,
      orgId,
      `SELECT id, organization_id, current_balance
       FROM customer_ledger_accounts
       WHERE customer_id = $1
       FOR UPDATE;`,
      [customerId]
    );

    if (accRes.rows.length > 0) {
      if (String(accRes.rows[0]!.organization_id || '').toLowerCase() !== orgId.toLowerCase()) {
        throw new ForbiddenTenantError(`Cross-tenant ledger account conflict for customer '${customerId}'.`);
      }
      return {
        accountId: accRes.rows[0]!.id,
        currentBalance: Number(accRes.rows[0]!.current_balance || 0),
      };
    }

    const accountUuid =
      preferredAccountId && UUID_REGEX.test(preferredAccountId.trim())
        ? preferredAccountId.trim()
        : crypto.randomUUID();
    const safeInitial = Math.round((Number(initialBalance || 0) + Number.EPSILON) * 100) / 100;

    const createdAcc = await this.queryTenant<{ id: string; current_balance: string | number }>(
      txClient,
      orgId,
      `INSERT INTO customer_ledger_accounts (id, customer_id, organization_id, currency, current_balance, last_transaction_at, updated_at)
       VALUES ($1, $2, $3, 'INR', $4, NOW(), NOW())
       ON CONFLICT (customer_id) DO UPDATE SET updated_at = NOW()
       WHERE customer_ledger_accounts.organization_id = EXCLUDED.organization_id
       RETURNING id, current_balance;`,
      [accountUuid, customerId, orgId, safeInitial]
    );
    if (createdAcc.rows.length === 0) {
      throw new ForbiddenTenantError(`Cross-tenant ledger account conflict for customer '${customerId}'.`);
    }
    return {
      accountId: createdAcc.rows[0]!.id,
      currentBalance: Number(createdAcc.rows[0]!.current_balance || 0),
    };
  }

  private async executeJournalMutation(params: {
    organizationId: string;
    customerId: string;
    operatorId: string;
    entryId: string;
    direction: 'CREDIT' | 'DEBIT';
    amount: number;
    transactionType: string;
    referenceEntity: string;
    referenceId?: string;
    description: string;
    idempotencyKey: string;
    contraAccountType: string;
    preferredAccountId?: string;
  }): Promise<{ ledgerTransactionId: string; balanceAfter: number; isIdempotentReplay: boolean }> {
    const { orgId, tenantDb } = await this.getAuthorizedTenantDb(params.organizationId);
    const amount = Number(params.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new DomainValidationError('Ledger entry amount must be a positive number.', 'INVALID_LEDGER_AMOUNT');
    }
    const roundedAmount = Math.round((amount + Number.EPSILON) * 100) / 100;
    if (roundedAmount <= 0) {
      throw new DomainValidationError('Ledger entry amount must be at least 0.01.', 'INVALID_LEDGER_AMOUNT');
    }

    if (!params.operatorId || typeof params.operatorId !== 'string' || !UUID_REGEX.test(params.operatorId.trim())) {
      throw new DomainValidationError(
        'Valid authenticated operator ID is required for ledger transactions.',
        'INVALID_OPERATOR'
      );
    }
    const requestedOperatorId = params.operatorId.trim();

    if (!params.entryId || typeof params.entryId !== 'string' || !UUID_REGEX.test(params.entryId.trim())) {
      throw new DomainValidationError('Valid ledger entry UUID is required.', 'INVALID_LEDGER_ENTRY_ID');
    }
    const cleanEntryId = params.entryId.trim();

    const cleanIdempotencyKey = (params.idempotencyKey || '').trim();
    if (!cleanIdempotencyKey) {
      throw new DomainValidationError('Idempotency key is required for ledger transactions.', 'INVALID_IDEMPOTENCY_KEY');
    }

    return await tenantDb.withTransaction(async (txClient) => {
      // 1. Validate customer, center, and authenticated operator inside the tenant transaction
      const { customerId, centerId, operatorId } = await this.validateCustomerCenterAndOperator(txClient, {
        organizationId: orgId,
        customerId: params.customerId,
        operatorId: requestedOperatorId,
      });

      // 2. Acquire account row lock (FOR UPDATE) BEFORE checking idempotency or mutating state
      const { accountId, currentBalance } = await this.lockOrCreateLedgerAccount(
        txClient,
        orgId,
        customerId,
        params.preferredAccountId,
        0.0
      );

      // 3. Re-check idempotency (both idempotency_key and entry id) AFTER obtaining the account lock
      const existingTxn = await this.queryTenant<{ id: string; customer_id: string; balance_after: string | number }>(
        txClient,
        orgId,
        `SELECT id, customer_id, balance_after
         FROM ledger_transactions
         WHERE (idempotency_key = $1 OR id = $2)
           AND organization_id = $3
         LIMIT 1;`,
        [cleanIdempotencyKey, cleanEntryId, orgId]
      );
      if (existingTxn.rows.length > 0) {
        const existing = existingTxn.rows[0]!;
        if (String(existing.customer_id || '').toLowerCase() !== customerId.toLowerCase()) {
          throw new DomainValidationError(
            'Idempotency key or entry ID conflict across customers.',
            'IDEMPOTENCY_CONFLICT'
          );
        }
        return {
          ledgerTransactionId: existing.id,
          balanceAfter: Number(existing.balance_after),
          isIdempotentReplay: true,
        };
      }

      // 4. Calculate resulting balance strictly from authoritative locked database balance
      const isCredit = params.direction === 'CREDIT';
      const newBal = isCredit
        ? Math.round((currentBalance + roundedAmount + Number.EPSILON) * 100) / 100
        : Math.round((currentBalance - roundedAmount + Number.EPSILON) * 100) / 100;

      const refId = params.referenceId && UUID_REGEX.test(params.referenceId) ? params.referenceId : accountId;

      // 5. Insert exactly one ledger transaction
      const txnRes = await this.queryTenant<{ id: string }>(
        txClient,
        orgId,
        `INSERT INTO ledger_transactions (
          id, organization_id, center_id, customer_id, transaction_type,
          direction, amount, balance_after, reference_entity, reference_id,
          description, idempotency_key, created_by, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, NOW()
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id;`,
        [
          cleanEntryId,
          orgId,
          centerId,
          customerId,
          params.transactionType,
          params.direction,
          roundedAmount,
          newBal,
          params.referenceEntity,
          refId,
          params.description,
          cleanIdempotencyKey,
          operatorId,
        ]
      );

      if (txnRes.rows.length === 0) {
        const recheck = await this.queryTenant<{ id: string; customer_id: string; balance_after: string | number }>(
          txClient,
          orgId,
          `SELECT id, customer_id, balance_after
           FROM ledger_transactions
           WHERE idempotency_key = $1 AND organization_id = $2
           LIMIT 1;`,
          [cleanIdempotencyKey, orgId]
        );
        if (recheck.rows.length === 0) {
          throw new DomainValidationError('Idempotency key conflict across organizations.', 'IDEMPOTENCY_CONFLICT');
        }
        const existing = recheck.rows[0]!;
        if (String(existing.customer_id || '').toLowerCase() !== customerId.toLowerCase()) {
          throw new DomainValidationError(
            'Idempotency key conflict across customers.',
            'IDEMPOTENCY_CONFLICT'
          );
        }
        return {
          ledgerTransactionId: existing.id,
          balanceAfter: Number(existing.balance_after),
          isIdempotentReplay: true,
        };
      }

      // 6. Insert exactly two balanced double-entry journal lines
      const insertLineSql = `
        INSERT INTO ledger_entries (
          transaction_id, account_id, account_type, entry_type, amount
        ) VALUES ($1, $2, $3, $4, $5);
      `;
      if (isCredit) {
        await this.queryTenant(txClient, orgId, insertLineSql, [cleanEntryId, accountId, 'CUSTOMER_PAYABLE', 'CREDIT', roundedAmount]);
        await this.queryTenant(txClient, orgId, insertLineSql, [cleanEntryId, centerId, params.contraAccountType, 'DEBIT', roundedAmount]);
      } else {
        await this.queryTenant(txClient, orgId, insertLineSql, [cleanEntryId, accountId, 'CUSTOMER_PAYABLE', 'DEBIT', roundedAmount]);
        await this.queryTenant(txClient, orgId, insertLineSql, [cleanEntryId, centerId, params.contraAccountType, 'CREDIT', roundedAmount]);
      }

      // 7. Update account balance atomically after transaction and journal lines succeed
      await this.queryTenant(
        txClient,
        orgId,
        `UPDATE customer_ledger_accounts
         SET current_balance = $1, last_transaction_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND organization_id = $3;`,
        [newBal, accountId, orgId]
      );

      return {
        ledgerTransactionId: cleanEntryId,
        balanceAfter: newBal,
        isIdempotentReplay: false,
      };
    });
  }

  public async appendEntry(params: {
    organizationId: string;
    customerId: string;
    operatorId: string;
    entryType: 'CREDIT' | 'DEBIT';
    amount: number;
    balanceAfter?: number;
    referenceId?: string;
    sourceModule?: string;
    description: string;
    idempotencyKey?: string;
  }): Promise<{ ledgerTransactionId: string; balanceAfter: number; isIdempotentReplay: boolean }> {
    const isCredit = params.entryType === 'CREDIT';
    const source = String(params.sourceModule || '').trim().toUpperCase();

    let transactionType: string;
    let referenceEntity: string;
    let contraAccountType: string;

    if (source === 'MANUAL_ADJUSTMENT') {
      transactionType = isCredit ? 'LEDGER_ADJUSTMENT_CREDIT' : 'LEDGER_ADJUSTMENT_DEBIT';
      referenceEntity = 'MANUAL_ADJUSTMENT';
      contraAccountType = isCredit ? 'MILK_PURCHASE_EXPENSE' : 'CASH_BANK';
    } else if (source === 'COLLECTION_ADJUSTMENT') {
      transactionType = isCredit ? 'LEDGER_ADJUSTMENT_CREDIT' : 'LEDGER_ADJUSTMENT_DEBIT';
      referenceEntity = params.referenceId && UUID_REGEX.test(params.referenceId) ? 'MILK_COLLECTION' : 'MANUAL_ADJUSTMENT';
      contraAccountType = 'MILK_PURCHASE_EXPENSE';
    } else if (source === 'MILK_COLLECTION' || (isCredit && params.referenceId && UUID_REGEX.test(params.referenceId) && !source)) {
      transactionType = 'MILK_COLLECTION_CREDIT';
      referenceEntity = 'MILK_COLLECTION';
      contraAccountType = 'MILK_PURCHASE_EXPENSE';
    } else if (source === 'FEED_SALE' || !isCredit) {
      transactionType = 'FEED_PURCHASE_DEBIT';
      referenceEntity = 'FEED_SALE';
      contraAccountType = 'FEED_INVENTORY';
    } else {
      // Generic credit entry without a milk_collections referenceId must NOT claim
      // reference_entity = 'MILK_COLLECTION', otherwise reconcile_customer_ledger flags it as ORPHAN_TRANSACTION.
      transactionType = 'LEDGER_ADJUSTMENT_CREDIT';
      referenceEntity = 'MANUAL_ADJUSTMENT';
      contraAccountType = 'MILK_PURCHASE_EXPENSE';
    }

    return this.executeJournalMutation({
      organizationId: params.organizationId,
      customerId: params.customerId,
      operatorId: params.operatorId,
      entryId: crypto.randomUUID(),
      direction: params.entryType,
      amount: params.amount,
      transactionType,
      referenceEntity,
      referenceId: params.referenceId,
      description: params.description,
      idempotencyKey: params.idempotencyKey || `LEDGER-${crypto.randomUUID()}`,
      contraAccountType,
    });
  }

  public async findById(accountId: string, organizationId: string): Promise<CustomerLedgerAccount | null> {
    const { orgId, tenantDb } = await this.getAuthorizedTenantDb(organizationId);
    if (!accountId || !UUID_REGEX.test(accountId.trim())) {
      return null;
    }

    const sql = `
      SELECT 
        cla.id,
        cla.customer_id,
        cla.organization_id,
        cla.current_balance,
        cla.updated_at,
        COALESCE(SUM(CASE WHEN lt.direction = 'CREDIT' THEN lt.amount ELSE 0 END), 0.00) AS total_milk_earnings,
        COALESCE(SUM(CASE WHEN lt.direction = 'DEBIT' THEN lt.amount ELSE 0 END), 0.00) AS total_deductions
      FROM customer_ledger_accounts cla
      JOIN customers c ON c.id = cla.customer_id
      LEFT JOIN ledger_transactions lt ON lt.customer_id = cla.customer_id AND lt.organization_id = cla.organization_id
      WHERE cla.id = $1
        AND cla.organization_id = $2
        AND c.organization_id = $2
      GROUP BY cla.id, cla.customer_id, cla.organization_id, cla.current_balance, cla.updated_at;
    `;
    const result = await this.queryTenant(tenantDb, orgId, sql, [accountId.trim(), orgId]);
    if (result.rows.length === 0) return null;
    const row = result.rows[0]!;
    return new CustomerLedgerAccount({
      id: row.id,
      customerId: row.customer_id,
      organizationId: row.organization_id,
      currentBalance: Number(row.current_balance || 0),
      totalMilkEarnings: Number(row.total_milk_earnings || 0),
      totalDeductions: Number(row.total_deductions || 0),
      lastUpdated: row.updated_at?.toISOString?.() || String(row.updated_at),
    });
  }

  public async findByCustomer(customerId: string, organizationId: string): Promise<CustomerLedgerAccount | null> {
    const { orgId, tenantDb } = await this.getAuthorizedTenantDb(organizationId);
    if (!customerId || !UUID_REGEX.test(customerId.trim())) {
      return null;
    }
    const cleanCustomerId = customerId.trim();

    const accountSql = `
      SELECT 
        cla.id,
        cla.customer_id,
        cla.organization_id,
        cla.current_balance,
        cla.updated_at,
        COALESCE(SUM(CASE WHEN lt.direction = 'CREDIT' THEN lt.amount ELSE 0 END), 0.00) AS total_milk_earnings,
        COALESCE(SUM(CASE WHEN lt.direction = 'DEBIT' THEN lt.amount ELSE 0 END), 0.00) AS total_deductions
      FROM customer_ledger_accounts cla
      JOIN customers c ON c.id = cla.customer_id
      LEFT JOIN ledger_transactions lt ON lt.customer_id = cla.customer_id AND lt.organization_id = cla.organization_id
      WHERE (cla.customer_id = $1 OR c.global_customer_id = $1)
        AND cla.organization_id = $2
        AND c.organization_id = $2
        AND c.is_deleted = FALSE
      GROUP BY cla.id, cla.customer_id, cla.organization_id, cla.current_balance, cla.updated_at;
    `;

    const result = await this.queryTenant(tenantDb, orgId, accountSql, [cleanCustomerId, orgId]);
    if (result.rows.length > 0) {
      const row = result.rows[0]!;
      return new CustomerLedgerAccount({
        id: row.id,
        customerId: row.customer_id,
        organizationId: row.organization_id,
        currentBalance: Number(row.current_balance || 0),
        totalMilkEarnings: Number(row.total_milk_earnings || 0),
        totalDeductions: Number(row.total_deductions || 0),
        lastUpdated: row.updated_at?.toISOString?.() || String(row.updated_at),
      });
    }

    // Initialize ledger account ONLY if verified customer belongs to this tenant DB & org
    const custRes = await this.queryTenant<{ id: string; organization_id: string }>(
      tenantDb,
      orgId,
      `SELECT id, organization_id
       FROM customers
       WHERE (id = $1 OR global_customer_id = $1)
         AND organization_id = $2
         AND is_deleted = FALSE
       LIMIT 1;`,
      [cleanCustomerId, orgId]
    );
    if (custRes.rows.length === 0) {
      return null;
    }

    const tenantCustId = custRes.rows[0]!.id;
    const insertRes = await this.queryTenant<{ id: string; current_balance: string | number; updated_at: any }>(
      tenantDb,
      orgId,
      `INSERT INTO customer_ledger_accounts (customer_id, organization_id, currency, current_balance)
       VALUES ($1, $2, 'INR', 0.00)
       ON CONFLICT (customer_id) DO UPDATE SET updated_at = NOW()
       WHERE customer_ledger_accounts.organization_id = EXCLUDED.organization_id
       RETURNING id, current_balance, updated_at;`,
      [tenantCustId, orgId]
    );
    if (insertRes.rows.length === 0) {
      throw new ForbiddenTenantError(`Cross-tenant ledger account conflict for customer '${tenantCustId}'.`);
    }
    const row = insertRes.rows[0]!;
    return new CustomerLedgerAccount({
      id: row.id,
      customerId: tenantCustId,
      organizationId: orgId,
      currentBalance: Number(row.current_balance || 0),
      totalMilkEarnings: 0.0,
      totalDeductions: 0.0,
      lastUpdated: row.updated_at?.toISOString?.() || new Date().toISOString(),
    });
  }

  public async save(account: CustomerLedgerAccount): Promise<void>;
  public async save(
    account: CustomerLedgerAccount,
    newEntry: LedgerEntry,
    options: LedgerSaveActorOptions
  ): Promise<void>;
  public async save(
    account: CustomerLedgerAccount,
    newEntry?: LedgerEntry,
    options?: LedgerSaveActorOptions
  ): Promise<void> {
    const rawOrgId = (account as any).props?.organizationId || account.organizationId;

    if (newEntry) {
      const creditAmt = Number(newEntry.creditAmount || 0);
      const debitAmt = Number(newEntry.debitAmount || 0);
      if ((creditAmt > 0 && debitAmt > 0) || (creditAmt <= 0 && debitAmt <= 0)) {
        throw new DomainValidationError(
          'Ledger entry must specify either a positive creditAmount or a positive debitAmount.',
          'INVALID_LEDGER_AMOUNT'
        );
      }

      const direction: 'CREDIT' | 'DEBIT' = creditAmt > 0 ? 'CREDIT' : 'DEBIT';
      const amount = direction === 'CREDIT' ? creditAmt : debitAmt;
      const txnType =
        newEntry.type === 'MILK_CREDIT'
          ? 'MILK_COLLECTION_CREDIT'
          : newEntry.type === 'CASH_ADVANCE_DEBIT'
            ? 'ADVANCE_DEBIT'
            : newEntry.type === 'BANK_PAYOUT'
              ? 'PAYMENT_PAYOUT_DEBIT'
              : newEntry.type === 'ADJUSTMENT'
                ? (direction === 'CREDIT' ? 'LEDGER_ADJUSTMENT_CREDIT' : 'LEDGER_ADJUSTMENT_DEBIT')
                : 'FEED_PURCHASE_DEBIT';
      const refEntity =
        newEntry.type === 'MILK_CREDIT'
          ? 'MILK_COLLECTION'
          : newEntry.type === 'CASH_ADVANCE_DEBIT'
            ? 'CUSTOMER_ADVANCE'
            : newEntry.type === 'BANK_PAYOUT'
              ? 'CUSTOMER_PAYMENT'
              : newEntry.type === 'ADJUSTMENT'
                ? 'MANUAL_ADJUSTMENT'
                : 'FEED_SALE';
      const contraAccountType =
        direction === 'CREDIT'
          ? 'MILK_PURCHASE_EXPENSE'
          : txnType === 'FEED_PURCHASE_DEBIT'
            ? 'FEED_INVENTORY'
            : 'CASH_BANK';

      await this.executeJournalMutation({
        organizationId: rawOrgId,
        customerId: account.customerId,
        operatorId: options?.operatorId || '',
        entryId: newEntry.id,
        direction,
        amount,
        transactionType: txnType,
        referenceEntity: refEntity,
        referenceId: newEntry.referenceId,
        description: newEntry.description,
        idempotencyKey: options?.idempotencyKey?.trim() || `LEDGER-${newEntry.id}`,
        contraAccountType,
        preferredAccountId: account.id,
      });
      return;
    }

    const { orgId, tenantDb } = await this.getAuthorizedTenantDb(rawOrgId);
    await tenantDb.withTransaction(async (txClient) => {
      const { customerId } = await this.validateCustomerCenterAndOperator(txClient, {
        organizationId: orgId,
        customerId: account.customerId,
      });
      await this.lockOrCreateLedgerAccount(txClient, orgId, customerId, account.id, account.currentBalance);
    });
  }

  public async listEntries(customerId: string, limit = 50, offset = 0, organizationId?: string): Promise<LedgerEntry[]> {
    const { orgId, tenantDb } = await this.getAuthorizedTenantDb(organizationId);
    if (!customerId || !UUID_REGEX.test(customerId.trim())) {
      return [];
    }

    const sql = `
      SELECT 
        lt.id,
        lt.created_at,
        lt.transaction_type,
        lt.direction,
        lt.amount,
        lt.balance_after,
        lt.reference_entity,
        lt.description,
        lt.reference_id
      FROM ledger_transactions lt
      JOIN customers c ON c.id = lt.customer_id
      WHERE (lt.customer_id = $1 OR c.global_customer_id = $1)
        AND lt.organization_id = $4
        AND c.organization_id = $4
      ORDER BY lt.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const mapRow = (row: any): LedgerEntry => ({
      id: row.id,
      transactionDate: row.created_at?.toISOString?.() || String(row.created_at),
      type: (row.direction === 'CREDIT' ? 'MILK_CREDIT' : 'FEED_DEBIT') as 'MILK_CREDIT' | 'FEED_DEBIT',
      entryType: (row.direction === 'CREDIT' ? 'MILK_CREDIT' : 'DEBIT') as any,
      direction: row.direction,
      referenceType: row.reference_entity === 'FEED_SALE' ? 'FEED_PURCHASE' : row.reference_entity,
      amount: Number(row.amount),
      description: row.description || (row.direction === 'CREDIT' ? 'Milk Collection Credit' : 'Deduction Debit'),
      source: row.reference_entity || (row.direction === 'CREDIT' ? 'MILK_COLLECTION' : 'FEED_SALE'),
      sourceModule: row.reference_entity || (row.direction === 'CREDIT' ? 'MILK_COLLECTION' : 'FEED_SALE'),
      creditAmount: row.direction === 'CREDIT' ? Number(row.amount) : 0.0,
      debitAmount: row.direction === 'DEBIT' ? Number(row.amount) : 0.0,
      runningBalance: Number(row.balance_after),
      referenceId: row.reference_id,
    } as any);

    const result = await this.queryTenant(tenantDb, orgId, sql, [customerId.trim(), limit, offset, orgId]);
    return result.rows.map(mapRow);
  }
}
