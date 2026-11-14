/**
 * DFarm Registration App - Secure Session Manager
 * Full parity with Kotlin SessionManager.kt (EncryptedSharedPreferences / Android Keystore)
 */

import * as SecureStore from 'expo-secure-store';
import { OfficerProfile } from '../types/models';

const KEY_AUTH_TOKEN = 'auth_token';
const KEY_OFFICER_PROFILE = 'officer_profile';
const KEY_ORGANIZATION_ID = 'org_id';
const KEY_ACTIVE_CENTER_ID = 'active_center_id';

class SessionManagerImpl {
  private inMemoryCache: {
    token: string | null;
    officer: OfficerProfile | null;
    orgId: string | null;
    activeCenterId: string | null;
  } = {
    token: null,
    officer: null,
    orgId: null,
    activeCenterId: null,
  };

  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const token = await SecureStore.getItemAsync(KEY_AUTH_TOKEN);
      const officerStr = await SecureStore.getItemAsync(KEY_OFFICER_PROFILE);
      const orgId = await SecureStore.getItemAsync(KEY_ORGANIZATION_ID);
      const activeCenterId = await SecureStore.getItemAsync(KEY_ACTIVE_CENTER_ID);

      this.inMemoryCache.token = token;
      this.inMemoryCache.orgId = orgId;
      this.inMemoryCache.activeCenterId = activeCenterId;
      if (officerStr) {
        this.inMemoryCache.officer = JSON.parse(officerStr);
      }
    } catch {
      // In environment where SecureStore is unavailable (e.g. Node tests), cache remains in memory
    }
    this.initialized = true;
  }

  async saveSession(token: string, officer: OfficerProfile): Promise<void> {
    const officerJson = JSON.stringify(officer);
    const activeCenter = officer.centerId || officer.assignedCenters?.[0]?.centerId || null;

    this.inMemoryCache.token = token;
    this.inMemoryCache.officer = officer;
    this.inMemoryCache.orgId = officer.organizationId;
    this.inMemoryCache.activeCenterId = activeCenter;

    try {
      await SecureStore.setItemAsync(KEY_AUTH_TOKEN, token);
      await SecureStore.setItemAsync(KEY_OFFICER_PROFILE, officerJson);
      await SecureStore.setItemAsync(KEY_ORGANIZATION_ID, officer.organizationId);
      if (activeCenter) {
        await SecureStore.setItemAsync(KEY_ACTIVE_CENTER_ID, activeCenter);
      }
    } catch {
      // Memory fallback for headless test runners
    }
  }

  getToken(): string | null {
    return this.inMemoryCache.token;
  }

  getOfficer(): OfficerProfile | null {
    return this.inMemoryCache.officer;
  }

  getActiveCenterId(): string | null {
    return this.inMemoryCache.activeCenterId;
  }

  async setActiveCenterId(centerId: string): Promise<void> {
    this.inMemoryCache.activeCenterId = centerId;
    if (this.inMemoryCache.officer) {
      this.inMemoryCache.officer = {
        ...this.inMemoryCache.officer,
        centerId,
      };
    }
    try {
      await SecureStore.setItemAsync(KEY_ACTIVE_CENTER_ID, centerId);
      if (this.inMemoryCache.officer) {
        await SecureStore.setItemAsync(
          KEY_OFFICER_PROFILE,
          JSON.stringify(this.inMemoryCache.officer)
        );
      }
    } catch {
      // Memory fallback
    }
  }

  getOrganizationId(): string | null {
    return this.inMemoryCache.orgId;
  }

  isLoggedIn(): boolean {
    return !!this.inMemoryCache.token;
  }

  async clearSession(): Promise<void> {
    this.inMemoryCache = {
      token: null,
      officer: null,
      orgId: null,
      activeCenterId: null,
    };
    try {
      await SecureStore.deleteItemAsync(KEY_AUTH_TOKEN);
      await SecureStore.deleteItemAsync(KEY_OFFICER_PROFILE);
      await SecureStore.deleteItemAsync(KEY_ORGANIZATION_ID);
      await SecureStore.deleteItemAsync(KEY_ACTIVE_CENTER_ID);
    } catch {
      // Memory fallback
    }
  }
}

export const sessionManager = new SessionManagerImpl();
