# DFARM CUSTOMER APP — CLAYMORPHISM DESIGN SYSTEM SPECIFICATION

**Document Version:** 1.0.0  
**Date:** 2026-11-16  
**Theme Foundation:** DFarm / SparkLinks Approved Palette  
**Target:** React Native 0.88.1, Expo SDK 58, React 19.3.0  

---

## 1. Design System Philosophy

The DFarm Claymorphism Design System is built specifically for rural dairy farmers and cooperative milk producers in India. It bridges cutting-edge modern aesthetics with intuitive, high-tactility interactions.

Unlike "flat" or "skeuomorphic" extremes, **Claymorphism** creates:
1. **Physical Tangibility:** Cards and buttons appear sculpted from soft, warm clay with directional light, specular top-edge highlights, and warm diffuse shadows.
2. **Clear Affordance:** Farmers instantly understand what is pressable, what is recessed (inputs), and what is authoritative (verified data badges).
3. **Warm & Friendly Feel:** Avoids cold, sterile tech dashboards. Utilizes warm cream, organic orange, and soft peach tones that harmonize with agricultural life.
4. **Ergonomic Clarity:** Large touch targets ($\ge 48\times 48\text{ dp}$), high-contrast text, clear Marathi/English labelling, and one-handed thumb navigation.

---

## 2. Brand Visual Palette & Tokens

### 2.1 Core Palette Tokens

| Token Name | Hex Code | Purpose & Semantic Application |
|---|---|---|
| `primaryCream` | `#FFF5EE` | Primary Canvas Background. Gentle warm cream, non-glare for outdoor sunlight readability. |
| `primaryOrange` | `#FF6A00` | Primary Brand Color. High-contrast Call to Action buttons, active tabs, hero highlights. |
| `secondaryOrange` | `#F58A38` | Warm Secondary Accent. Gradients, secondary CTAs, focus indicators, warm shadow casts. |
| `peach` | `#FFE9DC` | Card Highlight Canvas. Hero cards, feature banners, soft badge containers. |
| `primaryText` | `#211B18` | Deep Espresso. Screen titles, card headers, high-contrast numeric values. ($\text{Contrast} > 11:1$). |
| `secondaryText` | `#817A75` | Warm Slate. Metadata, timestamps, helper descriptions, sub-labels. |
| `border` | `#F1E7E0` | Tactile Perimeter. 1px soft clay border defining raised and inset card surfaces. |

### 2.2 Extended Claymorphic Surfaces

| Token Name | Hex Code | Usage |
|---|---|---|
| `surfaceWhite` | `#FFFFFF` | Raised Card Surface. Pure white clay body with specular top highlight. |
| `surfaceInset` | `#FFF9F5` | Inset Cavity Surface. Used for text fields, search bars, OTP boxes, and unselected chips. |
| `surfaceHighlight`| `#FFEFE6` | Active selection background for selected dairy, active radio rows. |
| `specularHighlight`| `rgba(255, 255, 255, 0.85)` | 1.5px top inner edge gradient simulating physical overhead lighting. |
| `clayInnerShadow`| `rgba(33, 27, 24, 0.04)` | Inset cavity depth for text fields and pressed states. |

### 2.3 Dairy & Status Semantic Tokens

| Semantic Domain | Primary Hex | Background Hex | Border Hex | Usage |
|---|---|---|---|---|
| **Cow Milk** | `#E65100` | `#FFF3E0` | `#FFE0B2` | Cow intake records, cow volume summary, filter pills |
| **Buffalo Milk** | `#0277BD` | `#E1F5FE` | `#B3E5FC` | Buffalo intake records, buffalo volume summary |
| **Success / Approved** | `#2E7D32` | `#E8F5E9` | `#C8E6C9` | Active account, payment disbursed, verified biometric |
| **Pending / Review** | `#E65100` | `#FFF3E0` | `#FFE0B2` | Under Admin Review, OTP timer, pending settlement |
| **Error / Rejection** | `#C62828` | `#FFEBEE` | `#FFCDD2` | Form validation error, rejected application, camera denied |
| **Info / Society** | `#00838F` | `#E0F7FA` | `#B2EBF2` | Dairy details, official instructions, audit trail notice |

---

## 3. Claymorphism Depth & Shadow Architecture

True claymorphism combines **diffuse colored ambient shadows** with **tactile directional drop shadows** and **specular rim lighting**.

```
    ┌────────────────────────────────────────────────────────┐  ◄── 1.5px Specular Highlight (#FFFFFF)
    │                                                        │
    │                   Raised Clay Body                     │
    │                       #FFFFFF                          │
    │                                                        │
    └────────────────────────────────────────────────────────┘  ◄── 1px Tactile Border (#F1E7E0)
    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ◄── Ambient Colored Glow (#F58A38, 14% opacity)
       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░       ◄── Directional Gravity Shadow (Y: 6, R: 14)
```

### Shadow Token Matrix

```typescript
export const DFARM_SHADOWS = {
  // Raised Clay Card: Soft warm glow + directional drop
  clayCard: {
    shadowColor: '#F58A38',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  // Active / Selected Clay Card: Intensified primary orange elevation
  clayCardActive: {
    shadowColor: '#FF6A00',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.20,
    shadowRadius: 20,
    elevation: 6,
  },
  // Primary CTA Button: Tactile push elevation
  clayButton: {
    shadowColor: '#FF6A00',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 12,
    elevation: 5,
  },
  // Secondary Button: Deep espresso subtle drop
  claySecondaryButton: {
    shadowColor: '#211B18',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  // Floating Tab Bar: Upward directional elevation
  clayTabBar: {
    shadowColor: '#211B18',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 8,
  },
} as const;
```

---

## 4. Typography Hierarchy & Number Scale

Readability is paramount for farmers checking FAT, SNF, Liters, and Rupee amounts in variable outdoor lighting conditions.

| Token | Size / LineHeight | Weight | Color Token | Application |
|---|---|---|---|---|
| `h1` | 26 / 32 | Bold (700) | `primaryText` | Screen titles, hero welcome, major status headings |
| `h2` | 20 / 26 | Bold (700) | `primaryText` | Section titles, modal headers, major card headings |
| `h3` | 17 / 22 | SemiBold (600) | `primaryText` | Dairy name, transaction titles, sub-section headers |
| `bodyLg` | 15 / 21 | Medium (500) | `primaryText` | Important body statements, form inputs, button text |
| `bodyMd` | 13 / 18 | Regular (400) | `secondaryText` | Subtitles, descriptive paragraphs, secondary labels |
| `bodySm` | 11 / 15 | Regular (400) | `secondaryText` | Timestamps, receipt metadata, legal footnotes |
| `numberDisplay` | 32 / 38 | ExtraBold (800)| `primaryOrange` | Milk volume liters (`14.5 L`), Khata balance (`₹12,450`) |
| `numberSub` | 18 / 22 | Bold (700) | `primaryText` | Daily FAT (`4.2%`), SNF (`8.5%`), Rate (`₹38.50/L`) |
| `badge` | 11 / 14 | Bold (700) | Semantic | Status tags, shift tags, animal categories |

---

## 5. Spacing, Corner Radius & Layout Grid

### 5.1 Spacing Scale (8pt Baseline Grid)

```typescript
export const DFARM_SPACING = {
  xs: 4,      // Micro gaps, icon-text spacing
  sm: 8,      // Chip padding, badge gaps, internal element spacing
  md: 12,     // Compact card padding, header margin
  lg: 16,     // Standard screen margin, standard card padding
  xl: 20,     // Form section gaps, modal content padding
  xxl: 24,    // Major screen vertical spacing
  xxxl: 32,   // Hero padding, status illustration spacing
  huge: 48,   // Maximum spacer, thumb-reach clearance
} as const;
```

### 5.2 Corner Radius Scale

All clay elements feature generous, organic rounded corners to emulate hand-sculpted clay:

```typescript
export const DFARM_RADIUS = {
  xs: 6,      // Small tags, thermal receipt notches
  sm: 10,     // Inset input cells, back button, filter chips
  md: 16,     // Inner card sections, status banners
  lg: 22,     // Standard raised clay cards, primary buttons
  xl: 28,     // Modal bottom sheets, hero cards
  pill: 9999, // Badges, avatars, floating action chips
} as const;
```

---

## 6. Shared Reusable Component Guidelines

### 6.1 `ClayCard`
* **Variants:**
  - `raised`: Default white clay body with warm diffuse shadow and specular edge.
  - `highlight`: Warm peach (`#FFE9DC`) body for today's intake and Khata summary.
  - `inset`: Recessed cavity (`#FFF9F5`) without drop shadow for secondary details.
  - `orange`: Full brand orange clay surface for high-visibility highlights.
* **Touch Feedback:** Interactive cards scale to `0.985` with active shadow elevation.

### 6.2 `ClayButton`
* **Variants:** `primary` (solid orange clay), `secondary` (warm peach/white clay), `outline` (cream surface with 1.5px orange border), `ghost` (clean text action), `danger` (tactile red clay).
* **Sizes:** `lg` (54px height, full-width CTA), `md` (44px height), `sm` (34px height).
* **Tactile Press:** Native haptic feedback (`expo-haptics`), spring scale transform (`transform: [{ scale: 0.98 }]`), specular highlight shift.
* **Loading State:** Centered `ActivityIndicator` replacing button text while preserving exact dimensions to avoid layout shift.

### 6.3 `ClayInput`
* **Recessed Cavity:** `#FFF9F5` background, 1px `#F1E7E0` border.
* **Focused Active State:** 1.5px border `#FF6A00` with soft orange glow.
* **Error State:** 1.5px border `#D32F2F`, error text beneath in `#D32F2F`.
* **Touch Target:** Minimum height 52px, large readable font (16px) to avoid iOS/Android auto-zoom.

### 6.4 `ClayOTPInput`
* 6 distinct individual clay boxes (width 48px, height 58px).
* Smooth cursor focus ring, specular top highlight, automatic native keyboard auto-fill support via `textContentType="oneTimeCode"`.

### 6.5 `ClayModal` (Bottom Sheet)
* Raised clay sheet emerging from bottom with organic 28px top corner radius.
* Tactile handle bar (`44x5px`) for swipe-down dismissal.
* Backdrop: Semi-transparent espresso tint (`rgba(33, 27, 24, 0.45)`).

### 6.6 `ClayBadge`
* Tactile pill with 1px border, specular highlight line, and semantic color pairings.
* Supports optional leading vector icon.

---

## 7. Motion & Micro-Interactions

All animations follow organic, fluid spring curves that feel physical rather than digital:

1. **Button Tap:** `Animated.spring` with tension 300, friction 20, scale down to `0.98`.
2. **Card Entrance:** Subtle upward slide (`translateY: 12` to `0`) with fade-in over 240ms.
3. **Face Scanner Reticle:** Smooth 2.5-second breathing pulse animation for the alignment guide oval.
4. **Pull-to-Refresh:** Smooth cream pull indicator with rotating orange milk-can emblem.
5. **Reduced Motion:** If user enables system reduced-motion, animations fall back to instant transitions.

---

## 8. Mobile Ergonomics & Farmer Accessibility

1. **Thumb Zone Rule:** All primary CTAs (Submit, Continue, Verify, Capture) are positioned in the bottom 40% of the screen for effortless one-handed thumb access.
2. **High-Contrast Guarantee:** Primary text `#211B18` against `#FFF5EE` background yields an $11.8:1$ contrast ratio, easily exceeding WCAG AAA standard ($7:1$).
3. **Touch Targets:** No interactive button, chip, or link is smaller than $48\times 48\text{ dp}$.
4. **Bilingual Clarity:** Standard industry terminology is paired with familiar rural terms (e.g., "Customer Khata / खाते", "Shift / पाळी", "FAT / फॅट", "SNF / एस.एन.एफ.").
5. **Keyboard Resilience:** All forms utilize `KeyboardAvoidingView` with `keyboardShouldPersistTaps="handled"` so fields remain visible and interactive above the soft keyboard.
