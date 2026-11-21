# 11 — CACHE AND SESSION ISOLATION

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Systems:** `apps/dfarm-customer-app`, `SecureStorage`, `@tanstack/react-query`

---

## 1. Storage Isolation Keys

The customer app persists authentication and active context in platform-native secure storage (iOS Keychain / Android Keystore) via `expo-secure-store` with an AsyncStorage fallback:

```typescript
export const STORAGE_KEYS = {
  TOKEN: 'dfarm_customer_auth_token',
  REFRESH_TOKEN: 'dfarm_customer_refresh_token',
  USER_DATA: 'dfarm_customer_user_data',
  REMEMBER_ME: 'dfarm_customer_remember_me',
  PHONE_NUMBER: 'dfarm_customer_phone_number',
  ORGANIZATION_ID: 'dfarm_customer_org_id',
  DAIRY_NAME: 'dfarm_customer_dairy_name',
  GLOBAL_CUSTOMER_ID: 'dfarm_customer_global_id',
  FARMER_CODE: 'dfarm_customer_farmer_code',
} as const;
```

---

## 2. Cache Invalidation Lifecycle on Dairy Switch

When a customer switches from Dairy A to Dairy B, stale operational data in the memory cache could lead to dangerous financial or collection confusion. To guarantee total isolation:

```typescript
const switchDairyMutation = useMutation({
  mutationFn: async ({ dairyId, globalCustomerId }: SwitchDairyRequest) => {
    return authService.switchDairy({ dairyId, globalCustomerId });
  },
  onSuccess: async (data) => {
    // 1. Update secure credentials for newly selected tenant
    await SecureStorage.setItem(STORAGE_KEYS.TOKEN, data.accessToken);
    await SecureStorage.setItem(STORAGE_KEYS.ORGANIZATION_ID, data.selectedDairy.dairyId);
    await SecureStorage.setItem(STORAGE_KEYS.DAIRY_NAME, data.selectedDairy.dairyName);
    if (data.selectedDairy.farmerCode) {
      await SecureStorage.setItem(STORAGE_KEYS.FARMER_CODE, data.selectedDairy.farmerCode);
    }

    // 2. CRITICAL: Clear all React Query query caches across all screens
    // Prevents milk collection history or passbook of Dairy A displaying under Dairy B
    queryClient.clear();

    // 3. Invalidate memberships list to reflect updated active dairy
    queryClient.invalidateQueries({ queryKey: ['customer-memberships'] });
    queryClient.invalidateQueries({ queryKey: ['customer-profile'] });
    queryClient.invalidateQueries({ queryKey: ['milk-collections'] });
    queryClient.invalidateQueries({ queryKey: ['customer-bills'] });
    queryClient.invalidateQueries({ queryKey: ['ledger-summary'] });
  },
});
```

---

## 3. Offline Data Partitioning

If offline capabilities or local SQLite databases are used, data tables are partitioned by `organization_id` or isolated into distinct SQLite files per dairy, preventing local data cross-contamination when switching offline.
