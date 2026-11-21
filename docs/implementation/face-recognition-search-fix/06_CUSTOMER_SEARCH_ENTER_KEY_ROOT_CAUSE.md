# DFARM — COLLECTION APP CUSTOMER SEARCH ENTER KEY ROOT CAUSE ANALYSIS

**Execution Reference:** `DFARM-FACE-RECOGNITION-AND-CUSTOMER-SEARCH-FIX`  
**Document Identifier:** `06_CUSTOMER_SEARCH_ENTER_KEY_ROOT_CAUSE.md`  
**Status:** COMPLETED & VERIFIED  
**Date:** November 2026  
**Auditor:** Antigravity AI Engineering  

---

## 1. INCIDENT DESCRIPTION & USER ACTION

At the Collection App workstation (`apps/dfarm-collection-app`):
1. The operator focuses the fast-search input bar: `Enter Farmer Code (e.g. C-101), Mobile, or RFID & [Enter]...`.
2. The operator types a valid search string (e.g. `C-101`, `9834388787`, or `Shubhangi`).
3. The operator presses the **Enter** key.
4. **Defect Symptom:** The expected matching customer result does not appear in the search result area.
5. In some instances, an error was displayed or the input failed to trigger search execution.

---

## 2. CODE EXECUTION AUDIT & DEFECT TRACE

### Defect 6.1: Backend HTTP 400 Due to Missing `organizationId` in `customersApi.list`
In `apps/dfarm-collection-app/src/api/client.ts:174-183`:
```typescript
list: async (params: { search?: string; category?: MilkCategory; limit?: number } = {}): Promise<CustomerIdentity[]> => {
  const searchParams = new URLSearchParams()
  if (params.search) searchParams.append('search', params.search)
  if (params.category) searchParams.append('category', params.category)
  if (params.limit) searchParams.append('limit', String(params.limit))

  const queryString = searchParams.toString()
  const endpoint = `/customers${queryString ? `?${queryString}` : ''}`
  const res = await apiRequest<{ success: boolean; data: any[] }>(endpoint)
  ...
}
```
In `services/backend/src/presentation/routes/customers.routes.ts:50-80`:
```typescript
router.get('/', optionalAuthenticate, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  ...
  if (!organizationId) {
    res.status(400).json({
      success: false,
      error: 'Dairy context (organizationId) is required.',
    });
    return;
  }
```
1. `customersApi.list()` never appended `organizationId` to the query string.
2. In `CustomerIdentityPanel.tsx:146`, `handleFarmerLookup` called `await customersApi.list({ search: query })`.
3. If `dairyId` was missing or not yet restored from client storage, the backend immediately rejected the search with **HTTP 400: `Dairy context (organizationId) is required.`**.
4. The catch block set `searchError = "Dairy context (organizationId) is required."`, and no results ever appeared.

### Defect 6.2: Form Enter Submission Suppression on Disabled Button
In `apps/dfarm-collection-app/src/components/workspace/CustomerIdentityPanel.tsx:261-297`:
```tsx
<form onSubmit={handleFarmerLookup} className="flex items-center gap-1.5">
  <input
    id="farmer-code-input"
    type="text"
    value={searchInput}
    onChange={(e) => setSearchInput(e.target.value)}
    ...
  />
  <ClayButton
    type="submit"
    disabled={isSearching || !searchInput.trim()}
    ...
  />
</form>
```
1. The `<input>` had no direct `onKeyDown` listener.
2. Under standard DOM and Chromium event specifications, pressing `Enter` inside a text input triggers implicit form submission **only if** the form contains a default submit button that is **not disabled**.
3. During input state transitions and asynchronous searching, the button's `disabled` state suppressed the `submit` event.
4. Pressing `Enter` in the input field failed to invoke `handleFarmerLookup()`.

### Defect 6.3: Limited In-Memory Key Mapping
In `apps/dfarm-collection-app/src/context/HardwareContext.tsx:114-122`:
```typescript
const customersMap = useMemo(() => {
  const map = new Map<string, CustomerIdentity>()
  for (const c of customersList) {
    map.set(c.id, c)
    if (c.customerCode) map.set(c.customerCode, c)
    if (c.farmerCode) map.set(c.farmerCode, c)
  }
  return map
}, [customersList])
```
`customersMap` only indexed `id`, `customerCode`, and `farmerCode`.
It did not index:
- Normalized phone numbers (e.g. `9834388787` or `+919834388787`).
- RFID card UIDs (when manually keyed in).
- Customer full names.
Consequently, searching by mobile number or name always bypassed the instant in-memory lookup and hit the failing HTTP 400 endpoint.

---

## 3. TARGETED REMEDIATION SPECIFICATION

1. **Explicit Enter Keydown Handler:**
   Attach `onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleFarmerLookup(); } }}` directly to the `<input>` element to ensure consistent execution regardless of button disable states.
2. **Propagate Dairy Context in Query:**
   Update `customersApi.list` to accept and automatically attach `organizationId` from `getStoredOperatorAuth().dairyId` in query strings (`/customers?search=...&organizationId=...`) and headers.
3. **Comprehensive Memory Indexing:**
   Expand `customersMap` in `HardwareContext.tsx` to index:
   - `c.farmerCode` & `c.customerCode`
   - `c.mobileNumber` & normalized 10-digit mobile
   - `c.rfidCardUid`
   - `c.fullName` (lowercase and normalized)
4. **Clear Result States:**
   - Single Match: Automatically select customer, update dossier, trigger voice announcement, and display brief visual confirmation.
   - Multiple Matches: Display selectable result items in the result pane.
   - No Matches: Display real `No patron found matching "${query}". Press F2 for patron directory.` state.
5. **Form Isolation:**
   Ensure `e.preventDefault()` stops Enter from bubbling to parent counter forms or triggering accidental "Save Intake".
