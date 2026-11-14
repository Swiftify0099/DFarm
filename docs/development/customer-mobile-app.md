# DFarm Customer Mobile Application — Developer Guide

## 1. Overview
The **DFarm Customer Mobile Application** (`apps/customer-mobile`) is a cross-platform React Native self-service application developed with **Expo (SDK 52)** and **TypeScript**. It serves dairy farmers delivering milk to DFarm dairy collection centers, providing instant, transparent, and authoritative access to their:
- Daily morning and evening milk collection records (weights in KG, Fat%, SNF%, rate per KG, total amount, and thermal receipts).
- Real-time double-entry customer ledger passbook (credits, feed debits, advances, payouts, and net balances).
- Periodic and monthly billing statements with authorized PDF downloads and sharing.
- Cattle feed purchase history and itemized invoice details.
- Payout disbursements, receipt records, and reversal tracking.
- Personal profile details with strict DPDP privacy protections (masked bank accounts, zero biometric data).
- In-app notification inbox with unread counts and read acknowledgments.

---

## 2. Technology Stack & Compatibility
- **Runtime & Framework**: React Native 0.76.7 / Expo SDK 52.
- **Language**: TypeScript 5.3+ (configured with pinned React 18 type definitions).
- **Navigation**: `@react-navigation/native` v7, `@react-navigation/bottom-tabs` v7, `@react-navigation/native-stack` v7.
- **Security & Storage**:
  - `expo-secure-store` for hardware-backed keystore token persistence.
  - `@react-native-async-storage/async-storage` for read-only offline caching and fallback storage.
- **Networking**: `@react-native-community/netinfo` for real-time cellular/Wi-Fi connectivity detection.
- **File Handling & Sharing**: `expo-file-system` and `expo-sharing` for authorized billing PDF retrieval and native sharing.
- **Build Targets**: Android (API level 24–35, Target SDK 34) and iOS (iOS 15.1+).

---

## 3. Directory Layout
```
apps/customer-mobile/
├── assets/                       # Adaptive icons, splash screen, and logos
├── src/
│   ├── api/                      # Strongly-typed API client services
│   │   ├── client.ts             # Base fetch client with Bearer auth & correlation ID
│   │   ├── auth.api.ts           # Supabase OTP & developer token session login
│   │   ├── dashboard.api.ts      # Authoritative dashboard KPIs & today's milk stats
│   │   ├── collections.api.ts    # Milk intake register, category & shift filters, receipts
│   │   ├── ledger.api.ts         # Customer passbook summary & transaction history
│   │   ├── billing.api.ts        # Monthly bills, cycles & PDF downloads
│   │   ├── feed.api.ts           # Cattle feed sales & itemized invoices
│   │   ├── payments.api.ts       # Payout disbursements & receipts
│   │   ├── profile.api.ts        # Self-service profile & preferences
│   │   └── notifications.api.ts  # In-app notification inbox
│   ├── components/               # Reusable atomic UI components
│   │   ├── Badge.tsx             # Status badges (credit, debit, info, settled)
│   │   ├── Button.tsx            # Styled touchable buttons with loading states
│   │   ├── Card.tsx              # Elevated cards with tap action support
│   │   ├── EmptyState.tsx        # Zero-data informative placeholers
│   │   ├── Input.tsx             # Secure labeled text inputs
│   │   ├── LoadingSpinner.tsx    # Full-screen & inline activity indicators
│   │   ├── OfflineBanner.tsx     # Connection state & last synced timestamp banner
│   │   ├── StatTile.tsx          # Key performance indicator metric cards
│   │   ├── ThermalSlip.tsx       # Monospace 40-column digital receipt slip
│   │   └── theme/
│   │       ├── colors.ts         # DFarm brand palette & semantic tokens
│   │       └── typography.ts     # Platform font stacks and sizes
│   ├── context/
│   │   ├── AuthContext.tsx       # Auth session state, credentials & logout cleanup
│   │   └── NetworkContext.tsx    # Live network listener & offline state
│   ├── navigation/
│   │   ├── AppNavigator.tsx      # Root coordinator (Auth vs Main tabs)
│   │   ├── AuthNavigator.tsx     # Login & OTP screens
│   │   ├── MainTabNavigator.tsx  # Bottom tab bar & nested feature stacks
│   │   └── types.ts              # Strongly typed route parameter lists
│   ├── screens/                  # Feature screens
│   │   ├── auth/                 # LoginScreen, OtpVerificationScreen
│   │   ├── dashboard/            # DashboardScreen
│   │   ├── milk/                 # MilkHistoryScreen, CollectionDetailScreen
│   │   ├── ledger/               # CustomerLedgerScreen
│   │   ├── billing/              # MonthlyBillsScreen, PdfViewerScreen
│   │   ├── feed/                 # FeedHistoryScreen, FeedSaleDetailScreen
│   │   ├── payments/             # PaymentsScreen, PaymentDetailScreen
│   │   ├── notifications/        # NotificationsScreen
│   │   └── profile/              # ProfileScreen, EditProfileScreen, SettingsScreen, SupportScreen
│   ├── storage/
│   │   ├── cache.ts              # Offline read-only cache with TTL & wiping
│   │   └── secure-token.ts       # SecureStore + AsyncStorage session token manager
│   ├── utils/
│   │   └── formatters.ts         # INR currency, strict KG formatting, dates
│   └── __tests__/
│       └── customer-mobile-client.test.ts  # Client unit & utility tests
├── app.json                      # Expo application manifest
├── App.tsx                       # Root container with contexts & safe area provider
├── index.js                      # Entrypoint registering App component
├── package.json                  # Workspace dependencies
└── tsconfig.json                 # Pinned React 18 / React Native compiler options
```

---

## 4. Local Development Setup

### Prerequisites
- Node.js 20+ (Node 22 LTS tested)
- npm 10+
- Expo CLI (`npx expo`)
- Android Studio / Android Emulator or physical device with Expo Go

### Installation
From the repository root:
```bash
npm install
```

### Environment Variables
Configure `apps/customer-mobile/.env` or supply system environment variables:
```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1      # Android Emulator local backend
# For physical device debugging over LAN:
# EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:3000/api/v1
```

### Running the App
```bash
# Start Expo development bundler
npm run start --workspace=apps/customer-mobile

# Run directly on connected Android device/emulator
npm run android --workspace=apps/customer-mobile

# Run TypeScript checks
npm run typecheck --workspace=apps/customer-mobile
# Or directly:
cd apps/customer-mobile && npx tsc --noEmit

# Run Client Unit Tests
npm test --workspace=apps/customer-mobile
```

---

## 5. Offline Caching Guidelines
1. **Read-Only Local Storage**: All cached records are stored with a timestamp (`syncedAt`) and a time-to-live (`ttlMs`, default 24 hours).
2. **Authoritative Backend Data**: The app displays an `OfflineBanner` indicating whether the currently viewed screen data is fresh from the server or loaded from the offline cache.
3. **No Client Writes**: The customer app never writes or alters ledger balances or milk intake records offline.
4. **Session Cleanup**: Calling `auth.logout()` automatically clears both the `SecureStore` authentication token and all cached records in `AsyncStorage` via `clearOfflineCache()`.
