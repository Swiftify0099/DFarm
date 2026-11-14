import { CollectionApiClient } from '../../api/client';
import { ICollectionDatabase } from '../../database/CollectionDatabase';
import { ISessionManager } from '../../storage/SessionManager';
import {
  CollectionHistoryItemDto,
  CollectionReceipt,
  Customer,
  CustomerStatus,
  IdentificationMethod,
  MilkCategory,
  OfficerProfile,
  RateCalculationResult,
  Shift,
  ShiftSummaryDto,
} from '../../types';
import { IdentificationResult } from '../identification/CustomerIdentificationService';
import { ReceiptFormatter } from '../receipt/ReceiptFormatter';
import { DFarmSyncEngine } from '../sync/DFarmSyncEngine';

export interface CompletedCollectionResult {
  sessionId: string;
  collectionId: string;
  receiptNumber: string;
  totalAmount: number;
  newBalance: number | null;
  isOffline: boolean;
  receiptText: string;
}

export class CollectionRepository {
  constructor(
    private apiService: CollectionApiClient,
    private sessionManager: ISessionManager,
    private database: ICollectionDatabase,
    private syncEngine?: DFarmSyncEngine | null
  ) {}

  async getActiveCenterId(): Promise<string> {
    const id = await this.sessionManager.getActiveCenterId();
    return id || 'center_default';
  }

  async getActiveCenterName(): Promise<string> {
    const name = await this.sessionManager.getActiveCenterName();
    return name || 'Dairy Center';
  }

  async getOfficerName(): Promise<string> {
    const officer = await this.sessionManager.getOfficer();
    return officer?.fullName || officer?.email || 'Operator';
  }

  async getDeviceId(): Promise<string> {
    return this.sessionManager.getDeviceId();
  }

  async isLoggedIn(): Promise<boolean> {
    return this.sessionManager.isLoggedIn();
  }

  async logout(): Promise<void> {
    await this.sessionManager.clearSession();
  }

  async login(
    username: string,
    password: string
  ): Promise<{ success: boolean; officer?: OfficerProfile; error?: string }> {
    try {
      const response = await this.apiService.login(username.trim(), password);
      if (response && response.success && response.token && response.officer) {
        await this.sessionManager.saveSession(response.token, response.officer);
        return { success: true, officer: response.officer };
      }
      return {
        success: false,
        error: response?.message || 'Authentication failed',
      };
    } catch (e: any) {
      return { success: false, error: e.message || 'Login failed' };
    }
  }

  identifyByFace(): IdentificationResult {
    // Enforce strict project fail-safe rule:
    // Production face recognition model artifact is unverified.
    // Keep automatic recognition safely disabled and require RFID/Supervisor fallback.
    return {
      type: 'FAILURE',
      reason:
        'Production face model calibration is unverified (STAGING_UNVERIFIED). Automatic face match is disabled for fail-safety. Please use RFID Card Tap or Supervisor Manual verification.',
      errorCode: 'CALIBRATION_NOT_APPROVED',
    };
  }

  async identifyByRfid(rawCardUid: string): Promise<IdentificationResult> {
    if (!rawCardUid || rawCardUid.trim().length === 0) {
      return {
        type: 'FAILURE',
        reason: 'RFID tag cannot be empty',
        errorCode: 'INVALID_RFID',
      };
    }
    const normalized = rawCardUid
      .trim()
      .replace(/:/g, '')
      .replace(/-/g, '')
      .replace(/ /g, '')
      .toUpperCase();
    const centerId = await this.getActiveCenterId();
    const loggedIn = await this.isLoggedIn();

    // 1. Try online verification
    if (loggedIn) {
      try {
        const deviceId = await this.getDeviceId();
        const response = await this.apiService.identifyByRfid({
          cardUid: normalized,
          centerId,
          deviceId,
        });

        const data = response?.data;
        if (
          data &&
          data.success &&
          data.customer &&
          data.customerUuid
        ) {
          const custDto = data.customer;
          const permitted = (custDto.permittedCategories || []).map(
            (c) => c.toUpperCase() as MilkCategory
          );
          const domainCust: Customer = {
            id: data.customerUuid,
            organizationId: (await this.sessionManager.getOrganizationId()) || '',
            primaryCenterId: centerId,
            farmerCode: custDto.farmerCode || 'FARMER',
            fullName: custDto.fullName,
            mobileNumber: '',
            status: (custDto.status as CustomerStatus) || 'ACTIVE',
            permittedCategories: permitted.length > 0 ? permitted : ['COW'],
            rfidCardId: normalized,
          };
          return {
            type: 'SUCCESS',
            customer: domainCust,
            canonicalUuid: data.customerUuid,
            method: 'RFID',
            identifiedAt: Date.now(),
          };
        } else {
          const reason =
            data?.message ||
            data?.rejectionReason ||
            response?.error?.message ||
            'RFID not recognized';
          return {
            type: 'FAILURE',
            reason,
            errorCode: data?.rejectionReason || 'RFID_REJECTED',
          };
        }
      } catch (_e) {
        // Network error, proceed to offline fallback
      }
    }

    // 2. Offline fallback to local database
    let cached = await this.database.getCustomerByRfid(normalized);
    if (!cached) {
      const searchRes = await this.database.searchCustomers(normalized);
      if (searchRes.length > 0) cached = searchRes[0];
    }

    if (cached) {
      if (cached.isDeleted || cached.isRevoked || cached.status !== 'ACTIVE') {
        return {
          type: 'FAILURE',
          reason: 'Customer is inactive or revoked',
          errorCode: 'CUSTOMER_INACTIVE',
        };
      }
      const permitted = cached.permittedCategories.map(
        (c) => c.toUpperCase() as MilkCategory
      );
      const domainCust: Customer = {
        id: cached.customerId,
        organizationId: (await this.sessionManager.getOrganizationId()) || '',
        primaryCenterId: cached.primaryCenterId,
        farmerCode: cached.farmerCode,
        fullName: cached.fullName,
        mobileNumber: cached.mobileNumber,
        status: (cached.status as CustomerStatus) || 'ACTIVE',
        permittedCategories: permitted.length > 0 ? permitted : ['COW'],
        rfidCardId: cached.rfidCardId || normalized,
      };
      return {
        type: 'SUCCESS',
        customer: domainCust,
        canonicalUuid: cached.customerId,
        method: 'RFID',
        identifiedAt: Date.now(),
      };
    }

    return {
      type: 'FAILURE',
      reason: `No active customer assigned to RFID tag: ${rawCardUid}`,
      errorCode: 'RFID_NOT_FOUND',
    };
  }

  async searchCustomers(query: string): Promise<Customer[]> {
    const q = query.trim();
    const centerId = await this.getActiveCenterId();
    const loggedIn = await this.isLoggedIn();

    // 1. Try online search
    if (loggedIn) {
      try {
        const response = await this.apiService.listCustomers({
          search: q,
          centerId,
          limit: 50,
        });
        const items = response?.data?.items || [];
        if (items.length > 0) {
          const orgId = (await this.sessionManager.getOrganizationId()) || '';
          return items
            .filter((it) => !it.isDeleted && it.status === 'ACTIVE')
            .map((dto) => {
              const permitted = (dto.permittedCategories || []).map(
                (c) => c.toUpperCase() as MilkCategory
              );
              return {
                id: dto.id,
                organizationId: dto.organizationId || orgId,
                primaryCenterId: dto.primaryCenterId || centerId,
                farmerCode: dto.farmerCode || 'FARMER',
                fullName: dto.fullName,
                mobileNumber:
                  dto.normalizedMobileNumber || dto.mobileNumber || '',
                status: (dto.status as CustomerStatus) || 'ACTIVE',
                permittedCategories:
                  permitted.length > 0 ? permitted : ['COW'],
              };
            });
        }
      } catch (_e) {
        // Network error, fall through to offline search
      }
    }

    // 2. Offline search in local database
    const cachedList = await this.database.searchCustomers(q);
    const orgId = (await this.sessionManager.getOrganizationId()) || '';
    return cachedList
      .filter((c) => !c.isDeleted && !c.isRevoked && c.status === 'ACTIVE')
      .map((c) => {
        const permitted = c.permittedCategories.map(
          (cat) => cat.toUpperCase() as MilkCategory
        );
        return {
          id: c.customerId,
          organizationId: orgId,
          primaryCenterId: c.primaryCenterId,
          farmerCode: c.farmerCode,
          fullName: c.fullName,
          mobileNumber: c.mobileNumber,
          status: (c.status as CustomerStatus) || 'ACTIVE',
          permittedCategories: permitted.length > 0 ? permitted : ['COW'],
          rfidCardId: c.rfidCardId || undefined,
        };
      });
  }

  async verifyBySupervisor(
    targetCustomerUuid: string,
    reasonCategory: string,
    justificationNotes: string,
    supervisorPin?: string | null
  ): Promise<IdentificationResult> {
    if (justificationNotes.trim().length < 5) {
      return {
        type: 'FAILURE',
        reason:
          'Supervisor manual identification requires audit justification (min 5 characters)',
        errorCode: 'SUPERVISOR_AUTH_REQUIRED',
      };
    }

    const centerId = await this.getActiveCenterId();
    const officer = await this.sessionManager.getOfficer();
    const supervisorId = officer?.id;
    const loggedIn = await this.isLoggedIn();

    // 1. Try online supervisor verification
    if (loggedIn) {
      try {
        const deviceId = await this.getDeviceId();
        const response = await this.apiService.verifyBySupervisor({
          targetCustomerUuid,
          reasonCategory,
          justificationNotes: justificationNotes.trim(),
          centerId,
          deviceId,
          supervisorId,
          supervisorPin: supervisorPin || null,
        });

        const data = response?.data;
        if (
          data &&
          data.success &&
          data.customer &&
          data.customerUuid
        ) {
          const custDto = data.customer;
          const permitted = (custDto.permittedCategories || []).map(
            (c) => c.toUpperCase() as MilkCategory
          );
          const domainCust: Customer = {
            id: data.customerUuid,
            organizationId: (await this.sessionManager.getOrganizationId()) || '',
            primaryCenterId: centerId,
            farmerCode: custDto.farmerCode || 'FARMER',
            fullName: custDto.fullName,
            mobileNumber: '',
            status: (custDto.status as CustomerStatus) || 'ACTIVE',
            permittedCategories: permitted.length > 0 ? permitted : ['COW'],
          };
          return {
            type: 'SUCCESS',
            customer: domainCust,
            canonicalUuid: data.customerUuid,
            method: 'SUPERVISOR_MANUAL',
            identifiedAt: Date.now(),
          };
        } else {
          const reason =
            data?.message ||
            data?.rejectionReason ||
            'Supervisor verification denied';
          return {
            type: 'FAILURE',
            reason,
            errorCode: data?.rejectionReason || 'SUPERVISOR_VERIFY_FAILED',
          };
        }
      } catch (_e) {
        // Fall through to offline
      }
    }

    // 2. Offline fallback
    let cached = await this.database.getCustomer(targetCustomerUuid);
    if (!cached) {
      cached = await this.database.getCustomerByFarmerCode(targetCustomerUuid);
    }
    if (cached) {
      if (cached.isDeleted || cached.isRevoked || cached.status !== 'ACTIVE') {
        return {
          type: 'FAILURE',
          reason: 'Customer is inactive or deleted',
          errorCode: 'CUSTOMER_INACTIVE',
        };
      }
      const permitted = cached.permittedCategories.map(
        (c) => c.toUpperCase() as MilkCategory
      );
      const domainCust: Customer = {
        id: cached.customerId,
        organizationId: (await this.sessionManager.getOrganizationId()) || '',
        primaryCenterId: cached.primaryCenterId,
        farmerCode: cached.farmerCode,
        fullName: cached.fullName,
        mobileNumber: cached.mobileNumber,
        status: (cached.status as CustomerStatus) || 'ACTIVE',
        permittedCategories: permitted.length > 0 ? permitted : ['COW'],
        rfidCardId: cached.rfidCardId || undefined,
      };
      return {
        type: 'SUCCESS',
        customer: domainCust,
        canonicalUuid: cached.customerId,
        method: 'SUPERVISOR_MANUAL',
        identifiedAt: Date.now(),
      };
    }

    return {
      type: 'FAILURE',
      reason: `Customer not found: ${targetCustomerUuid}`,
      errorCode: 'CUSTOMER_NOT_FOUND',
    };
  }

  async calculateRate(
    milkCategory: MilkCategory,
    fat: number,
    snf: number,
    netWeight: number
  ): Promise<{ success: boolean; result?: RateCalculationResult; error?: string }> {
    const centerId = await this.getActiveCenterId();
    const loggedIn = await this.isLoggedIn();

    // 1. Try online calculation
    if (loggedIn) {
      try {
        const response = await this.apiService.calculateRate({
          centerId,
          milkCategory,
          fat,
          snf,
          netWeight,
        });

        const data = response?.data;
        if (data) {
          return {
            success: true,
            result: {
              rateVersionId: data.rateVersionId || 'SERVER_VERSION',
              rateVersionNumber: data.rateVersionNumber || 1,
              rateChartId: data.rateChartId || 'SERVER_CHART',
              appliedRate: data.appliedRate,
              quantity: data.quantity,
              totalAmount: data.totalAmount,
              calculationRule: data.calculationRule || 'MATRIX_EXACT_MATCH',
              roundingMode: data.roundingMode || 'HALF_EVEN_2_DECIMALS',
            },
          };
        }
      } catch (err: any) {
        if (err.message && err.message.includes('RATE_CELL_NOT_FOUND')) {
          return {
            success: false,
            error: `RATE_CELL_NOT_FOUND: No approved rate for Fat: ${fat}%, SNF: ${snf}%`,
          };
        }
        // Fall through to offline
      }
    }

    // 2. Offline fallback via local cached rate cells
    const rate = await this.database.getApplicableRate(fat, snf);
    if (rate !== null && rate > 0) {
      const total = Math.round(netWeight * rate * 100) / 100;
      return {
        success: true,
        result: {
          rateVersionId: 'OFFLINE_VERSION',
          rateVersionNumber: 1,
          rateChartId: 'OFFLINE_CHART',
          appliedRate: rate,
          quantity: netWeight,
          totalAmount: total,
          calculationRule: 'LOCAL_CACHED_MATRIX',
          roundingMode: 'HALF_EVEN_2_DECIMALS',
        },
      };
    }

    return {
      success: false,
      error: `No applicable rate found for ${milkCategory} at Fat: ${fat}%, SNF: ${snf}%`,
    };
  }

  async commitMilkCollection(params: {
    customer: Customer;
    category: MilkCategory;
    method: IdentificationMethod;
    shift: Shift;
    businessDate: string;
    netWeight: number;
    fat: number;
    snf: number;
    appliedRate: number;
    totalAmount: number;
    idempotencyKey: string;
  }): Promise<{ success: boolean; result?: CompletedCollectionResult; error?: string }> {
    const centerId = await this.getActiveCenterId();
    const deviceId = await this.getDeviceId();
    const operatorName = await this.getOfficerName();
    const centerName = await this.getActiveCenterName();
    const clientIntakeUuid =
      'intake_' + Math.random().toString(36).substring(2, 10) + Date.now();
    const loggedIn = await this.isLoggedIn();

    // 1. Try online commit (Create session + Complete session)
    if (loggedIn) {
      try {
        const createRes = await this.apiService.createSession({
          customerId: params.customer.id,
          centerId,
          identificationMethod: params.method,
          milkCategory: params.category,
          shift: params.shift,
          businessDate: params.businessDate,
          deviceId,
          intakeSequenceUuid: clientIntakeUuid,
        });

        if (createRes?.data?.sessionId) {
          const sessionId = createRes.data.sessionId;

          const completeRes = await this.apiService.completeSession(sessionId, {
            clientIntakeUuid,
            idempotencyKey: params.idempotencyKey,
            netWeight: params.netWeight,
            fatPercentage: params.fat,
            snfPercentage: params.snf,
            source: 'MANUAL_ENTRY',
            deviceId,
          });

          if (completeRes?.data) {
            const compData = completeRes.data;
            const colId =
              compData.collection?.id ||
              'col_' + Math.random().toString(36).substring(2, 10);
            const receiptNumber =
              compData.receipt?.receiptNumber ||
              `RCP-${Date.now().toString().slice(-6)}`;
            const newBal = compData.ledger?.newBalance ?? null;

            let receiptText = '';
            try {
              const rRes = await this.apiService.getReceiptText(sessionId);
              if (rRes?.data?.receiptText) {
                receiptText = rRes.data.receiptText;
              }
            } catch (_e) {}

            if (!receiptText) {
              const receipt: CollectionReceipt = {
                receiptNumber,
                sessionUuid: sessionId,
                businessDate: params.businessDate,
                shift: params.shift,
                centerName,
                operatorName,
                customerCode: params.customer.farmerCode,
                customerName: params.customer.fullName,
                identificationMethod: params.method,
                milkCategory: params.category,
                weightKg: params.netWeight,
                fatPercentage: params.fat,
                snfPercentage: params.snf,
                ratePerUnit: params.appliedRate,
                totalAmount: params.totalAmount,
                timestamp: Date.now(),
                verificationHash: `VERIFIED-SRV-${colId.slice(0, 8)}`,
              };
              receiptText = ReceiptFormatter.generateReceiptText(receipt);
            }

            return {
              success: true,
              result: {
                sessionId,
                collectionId: colId,
                receiptNumber,
                totalAmount: params.totalAmount,
                newBalance: newBal,
                isOffline: false,
                receiptText,
              },
            };
          }
        }
      } catch (_e) {
        // Network error, proceed to offline-first save
      }
    }

    // 2. Offline-First Local Save
    const localSessionId =
      'sess_off_' + Math.random().toString(36).substring(2, 10) + Date.now();
    const localColId =
      'col_off_' + Math.random().toString(36).substring(2, 10) + Date.now();
    const receiptNumber = `RCP-OFFLINE-${Date.now().toString().slice(-6)}`;

    await this.database.saveCollectionSession({
      sessionId: localSessionId,
      customerId: params.customer.id,
      centerId,
      deviceId,
      businessDate: params.businessDate,
      shiftType: params.shift,
      milkCategory: params.category,
      identificationMethod: params.method,
      intakeSequenceUuid: clientIntakeUuid,
      sessionState: 'COMPLETED',
      startedAt: Date.now(),
      completedAt: Date.now(),
    });

    const localCollection = {
      collectionId: localColId,
      sessionId: localSessionId,
      customerId: params.customer.id,
      centerId,
      businessDate: params.businessDate,
      shiftType: params.shift,
      milkCategory: params.category,
      netWeight: params.netWeight,
      fatPercentage: params.fat,
      snfPercentage: params.snf,
      appliedRatePerUnit: params.appliedRate,
      totalAmount: params.totalAmount,
      idempotencyKey: params.idempotencyKey,
      syncStatus: 'PENDING_SYNC',
      createdAt: Date.now(),
    };

    const officer = await this.sessionManager.getOfficer();
    const payload = JSON.stringify({
      sessionId: localSessionId,
      customerId: params.customer.id,
      centerId,
      businessDate: params.businessDate,
      shiftType: params.shift,
      milkCategory: params.category,
      netWeight: params.netWeight,
      fatPercentage: params.fat,
      snfPercentage: params.snf,
      appliedRatePerUnit: params.appliedRate,
      totalAmount: params.totalAmount,
      identificationMethod: params.method,
      intakeSequenceUuid: clientIntakeUuid,
      clientIntakeUuid,
      operatorId: officer?.id || '',
    });

    await this.database.saveMilkCollectionAndEnqueueSync(
      localCollection,
      params.idempotencyKey,
      payload
    );

    const receipt: CollectionReceipt = {
      receiptNumber,
      sessionUuid: localSessionId,
      businessDate: params.businessDate,
      shift: params.shift,
      centerName,
      operatorName,
      customerCode: params.customer.farmerCode,
      customerName: params.customer.fullName,
      identificationMethod: params.method,
      milkCategory: params.category,
      weightKg: params.netWeight,
      fatPercentage: params.fat,
      snfPercentage: params.snf,
      ratePerUnit: params.appliedRate,
      totalAmount: params.totalAmount,
      timestamp: Date.now(),
      verificationHash: 'OFFLINE-PENDING-SYNC',
    };

    return {
      success: true,
      result: {
        sessionId: localSessionId,
        collectionId: localColId,
        receiptNumber,
        totalAmount: params.totalAmount,
        newBalance: null,
        isOffline: true,
        receiptText: ReceiptFormatter.generateReceiptText(receipt),
      },
    };
  }

  async getCollectionHistory(
    date?: string | null,
    shift?: Shift | null
  ): Promise<CollectionHistoryItemDto[]> {
    const centerId = await this.getActiveCenterId();
    const loggedIn = await this.isLoggedIn();

    // 1. Online
    if (loggedIn) {
      try {
        const res = await this.apiService.getHistory({
          centerId,
          date: date || undefined,
          shift: shift || undefined,
          limit: 100,
        });
        if (res?.data && Array.isArray(res.data)) {
          return res.data;
        }
      } catch (_e) {}
    }

    // 2. Offline
    const localList = await this.database.getLocalCollections(100);
    const results: CollectionHistoryItemDto[] = [];
    for (const col of localList) {
      const cust = await this.database.getCustomer(col.customerId);
      results.push({
        id: col.collectionId,
        customer_id: col.customerId,
        farmer_code: cust?.farmerCode || 'FARMER',
        customer_name: cust?.fullName || 'Farmer',
        selected_milk_category: col.milkCategory,
        shift_type: col.shiftType,
        business_date: col.businessDate,
        session_state: col.syncStatus,
        net_weight: col.netWeight,
        fat_percentage: col.fatPercentage,
        snf_percentage: col.snfPercentage,
        applied_rate_per_unit: col.appliedRatePerUnit,
        total_amount: col.totalAmount,
      });
    }
    return results;
  }

  async getShiftSummary(shift: Shift, date: string): Promise<ShiftSummaryDto> {
    const centerId = await this.getActiveCenterId();
    const loggedIn = await this.isLoggedIn();

    // 1. Online
    if (loggedIn) {
      try {
        const res = await this.apiService.getShiftSummary({
          centerId,
          shift,
          date: date || undefined,
        });
        if (res?.data) {
          return res.data;
        }
      } catch (_e) {}
    }

    // 2. Offline aggregate
    const all = await this.database.getLocalCollections(100);
    const localList = all.filter(
      (it) => it.shiftType === shift && (!date || it.businessDate === date)
    );
    const count = localList.length;
    const totalWeight = localList.reduce((acc, it) => acc + it.netWeight, 0);
    const totalAmount = localList.reduce((acc, it) => acc + it.totalAmount, 0);
    const avgFat =
      count > 0
        ? localList.reduce((acc, it) => acc + it.fatPercentage, 0) / count
        : 0;
    const avgSnf =
      count > 0
        ? localList.reduce((acc, it) => acc + it.snfPercentage, 0) / count
        : 0;

    return {
      centerId,
      shift,
      businessDate: date,
      totalCollections: count,
      totalWeightKg: Math.round(totalWeight * 100) / 100,
      averageFat: Math.round(avgFat * 100) / 100,
      averageSnf: Math.round(avgSnf * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
    };
  }

  async getPendingSyncCount(): Promise<number> {
    const pending = await this.database.getPendingJournalEvents(100);
    return pending.length;
  }
}
