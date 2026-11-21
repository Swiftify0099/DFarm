# DFARM CUSTOMER APP — REUSABLE COMPONENT GUIDE

**Document Version:** 1.0.0  
**Date:** 2026-11-16  
**Scope:** `src/design-system/`  

---

## 1. Overview

The DFarm Customer App UI component library provides modular, accessible, and high-performance React Native components designed with Claymorphism principles. All components share common theme tokens defined in `src/design-system/theme.ts`.

---

## 2. Core Clay Components

### 2.1 `ClayCard`
* **File:** `src/design-system/ClayCard.tsx`
* **Description:** Primary container providing raised clay appearance with directional drop shadow and specular rim light.
* **Props:**
  - `variant?: 'raised' | 'highlight' | 'inset' | 'orange'`
  - `onPress?: () => void`
  - `disabled?: boolean`
  - `style?: StyleProp<ViewStyle>`
  - `children: React.ReactNode`
* **Usage Example:**
```tsx
<ClayCard variant="raised" onPress={handleSelect}>
  <Text style={styles.cardTitle}>Morning Collection</Text>
  <Text style={styles.cardValue}>14.5 Liters</Text>
</ClayCard>
```

---

### 2.2 `ClayButton`
* **File:** `src/design-system/ClayButton.tsx`
* **Description:** Tactile push button with native haptics, spring press scaling, and loading spinner.
* **Props:**
  - `title: string`
  - `onPress: () => void`
  - `variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'`
  - `size?: 'sm' | 'md' | 'lg'`
  - `loading?: boolean`
  - `disabled?: boolean`
  - `leftIcon?: React.ReactNode`
  - `rightIcon?: React.ReactNode`
* **Usage Example:**
```tsx
<ClayButton
  title="Get OTP Verification Code"
  onPress={handleSendOtp}
  loading={isRequesting}
  disabled={mobile.length !== 10}
  variant="primary"
  size="lg"
/>
```

---

### 2.3 `ClayInput`
* **File:** `src/design-system/ClayInput.tsx`
* **Description:** Recessed clay input field with clear label, focus ring, helper text, and validation error messaging.
* **Props:**
  - `label?: string`
  - `error?: string`
  - `helperText?: string`
  - `leftElement?: React.ReactNode`
  - `rightElement?: React.ReactNode`
  - Standard `TextInputProps`
* **Usage Example:**
```tsx
<ClayInput
  label="Mobile Number"
  placeholder="98765 43210"
  keyboardType="phone-pad"
  value={mobile}
  onChangeText={setMobile}
  error={error}
  leftElement={<Text style={styles.flag}>🇮🇳 +91</Text>}
/>
```

---

### 2.4 `ClayBadge`
* **File:** `src/design-system/ClayBadge.tsx`
* **Description:** Tactile pill indicator for status, animal categories, and operational shifts.
* **Props:**
  - `label: string`
  - `variant?: 'cow' | 'buffalo' | 'success' | 'pending' | 'warning' | 'error' | 'orange' | 'neutral'`
  - `icon?: React.ReactNode`
* **Usage Example:**
```tsx
<ClayBadge label="Cow Milk" variant="cow" icon={<CowIcon size={14} />} />
<ClayBadge label="Disbursed" variant="success" />
```

---

### 2.5 `ClayHeader`
* **File:** `src/design-system/ClayHeader.tsx`
* **Description:** Standard top navigation bar with tactile clay back button, screen title, subtitle, and optional right action.
* **Props:**
  - `title: string`
  - `subtitle?: string`
  - `onBack?: () => void`
  - `rightElement?: React.ReactNode`
* **Usage Example:**
```tsx
<ClayHeader
  title="Select Your Dairy"
  subtitle="Connect to your village collection center"
  onBack={() => router.back()}
/>
```

---

### 2.6 `ClayOTPInput`
* **File:** `src/design-system/ClayOTPInput.tsx`
* **Description:** 6-box tactile OTP entry container with smooth focus indicators and native auto-fill support.
* **Props:**
  - `length?: number` (default: 6)
  - `value: string`
  - `onChange: (otp: string) => void`
  - `error?: boolean`

---

### 2.7 `ClayModal`
* **File:** `src/design-system/ClayModal.tsx`
* **Description:** Bottom-sheet modal with clay handle bar, smooth backdrop, and scrollable container for receipts and statements.
* **Props:**
  - `visible: boolean`
  - `onClose: () => void`
  - `title: string`
  - `subtitle?: string`
  - `children: React.ReactNode`

---

### 2.8 State Views (`ClayStateView.tsx`)
* **`ClayLoadingState`**: Branded loading view with spinner and reassuring status text.
* **`ClayEmptyState`**: Tactile inset card with custom illustration and action button.
* **`ClayErrorState`**: Clear error reporting with retry button.

---

## 3. New Design Components to be Added

1. **`DFarmBrandMark`**: Scalable SVG brand logo and illuminated wordmark.
2. **`AnimalSelector`**: 3-way segmented clay switch with custom Cow and Buffalo SVG illustrations.
3. **`BiometricCameraFrame`**: Live camera viewfinder with tactile clay bezel, scanning guides, and real-time inference telemetry.
4. **`StatusTimeline`**: 3-step vertical progress tracker for application status review.
5. **`MetricTile`**: Specialized dairy metric display for FAT, SNF, and Liters with large bold numbers.
