# 12 — CUSTOMER APP PIXEL-PERFECT UI SPECIFICATION

**Execution Reference:** `DFARM-MULTI-DAIRY-CUSTOMER-MEMBERSHIP`  
**Target Application:** `apps/dfarm-customer-app`  
**Design System:** DFarm Claymorphism Design System (`DFARM_COLORS`, `DFARM_TYPOGRAPHY`, `DFARM_SHADOWS`)

---

## 1. Design System Tokens & Foundations

The UI follows the approved DFarm Indian Agro-Fintech Claymorphism style guide:
- **Primary Colors:**
  - `primary`: `#1B5E20` (Forest Green - Trust & Nature)
  - `primaryLight`: `#2E7D32` (Active highlights)
  - `secondary`: `#D48B14` (Warm Ochre / Cow Milk Gold)
  - `background`: `#F4F8F3` (Soft clay canvas)
  - `surface`: `#FFFFFF` (Card base)
  - `surfaceElevated`: `#FFFFFF`
- **Text Hierarchy:**
  - `primaryText`: `#1C2A1E` (High contrast charcoal green)
  - `secondaryText`: `#4D6352` (Subtle metadata)
  - `placeholder`: `#829787`
- **Claymorphism Shadows:**
  - Dual-light source drop shadows with inset top-left highlight border (`rgba(255,255,255,0.85)`).
  - Raised, Inset, and Highlight card variants (`ClayCard`).

---

## 2. Screen Specifications (Screens A through G)

### Screen A: OTP Login Screen (`(auth)/login.tsx` & `verify-otp.tsx`)
- Normalized 10-digit Indian mobile input with `+91` fixed country prefix.
- 6-box claymorphism PIN input with automatic submission on 6th digit.
- Resend timer with anti-spam cooldown indicator.

### Screen B: Dairy Accounts Selector (`(auth)/select-dairy.tsx`)
- Title: *"तुमची डेअरी खाती निवडा"* (Select Your Dairy Accounts).
- Subtitle: *"एकाच मोबाईल नंबरवर उपलब्ध असलेली तुमची मंजूर खाती"* (Your approved memberships on this mobile number).
- Card Layout:
  - Header with dairy name & cooperative code badge.
  - Farmer Code pill: `C-WARNA-101` in green inset badge.
  - Primary collection center: `Warna Main Center`.
  - Right chevron arrow: Green clay circle button with `→`.
- Bottom Action: "+ दुसऱ्या नवीन डेअरीसाठी अर्ज करा" (Register with another dairy).

### Screen C: Quick Dairy Switch Modal (`components/DairySwitchModal.tsx`)
- Accessible from Home Dashboard top header tag: `[🌿 Warna Dairy | C-WARNA-101 बदला ▾]`.
- Bottom sheet with soft claymorphism backdrop.
- Lists all customer memberships:
  - Active dairy: Highlighted green border + "सध्या सक्रिय" (Currently Active) tag.
  - Other approved dairies: 1-tap "स्विच करा" (Switch) button.
  - Pending approval: "मंजुरी प्रलंबित" warning badge with disabled button.
  - Rejected: "नाकारले" error badge.
- Action: "नवीन डेअरी जोडा" (+ Add New Dairy) navigating to `/dairy-discovery`.

### Screen D: Location-Based Dairy Discovery (`(onboarding)/dairy-discovery.tsx`)
- GPS banner with live latitude/longitude indicator.
- District / Area Preset Pills: Kolhapur, Warnanagar, Sangli, Tasgaon, Karad, Satara, Pune, Baramati, Ahmednagar, Solapur.
- Dairy Cards:
  - Cooperative Name, Dairy Code, Village, Taluka, District.
  - Distance chip: `📍 २.४ किमी अंतरावर` (2.4 km away).
  - Already registered detection: If customer is already a member, shows green badge "आधीच नोंदणीकृत" and "या डेअरीवर जा" button.

### Screen E: New Dairy Registration Form (`(onboarding)/register.tsx`)
- Target dairy locked in header card with address and center.
- Full Name, Mobile (pre-filled and locked), Village, Milk Supply Type (`COW` / `BUFFALO` / `BOTH`).
- Bank Details (Account Number, IFSC, Holder Name).
- Live Face Biometric Capture step.

### Screen F: Registration Pending Approval Screen (`(onboarding)/pending-approval.tsx`)
- Animated waiting status card with 3-step progress stepper:
  1. `नोंदणी प्राप्त` (Registration Received) - Green Check.
  2. `डेअरी ॲडमिन पडताळणी` (Dairy Admin Verification) - Amber In Progress.
  3. `शेतकरी कोड वाटप` (Farmer Code Allocation) - Neutral Pending.
- Action button: "माझी सर्व डेअरी खाती पहा" (View All My Dairy Accounts) returning to Screen B.

### Screen G: Customer Profile Multi-Dairy Management (`(main)/profile/index.tsx`)
- Section: *"माझी सर्व डेअरी खाती"* (My Dairy Memberships).
- Renders list of all memberships with farmer codes, centers, and lifecycle chips.
- "खाते बदला" (Switch Account) trigger for instant modal opening.
