/**
 * DFarm Design System - Claymorphism Design Tokens
 * 100% Greenfield Visual Identity
 */

export const DFARM_COLORS = {
  // Brand Approved Palette
  primaryCream: '#FFF5EE',     // Primary Canvas / Background
  primaryOrange: '#FF6A00',    // Primary Brand Orange / Call To Action
  secondaryOrange: '#F58A38',  // Secondary Orange / Gradients & Accents
  peach: '#FFE9DC',            // Warm Peach / Card Highlights & Soft Badges
  primaryText: '#211B18',      // Deep Espresso / High Contrast Headings & Data
  secondaryText: '#817A75',    // Warm Slate / Subtitles & Secondary Metadata
  border: '#F1E7E0',           // Tactile Edge / Soft 1px Clay Borders

  // Extended Claymorphic Surfaces
  surfaceWhite: '#FFFFFF',
  surfaceCard: '#FFFFFF',
  surfaceInset: '#FFF9F5',     // Inset text fields & pressed states
  surfaceHighlight: '#FFFFFF',

  // Dairy Sector Specific Tokens
  cowTag: '#FF9800',
  cowTagBg: '#FFF3E0',
  buffaloTag: '#29B6F6',
  buffaloTagBg: '#E1F5FE',

  // Status & Feedback Semantics
  success: '#2E7D32',
  successBg: '#E8F5E9',
  warning: '#ED6C02',
  warningBg: '#FFF4E5',
  error: '#D32F2F',
  errorBg: '#FFEBEE',
  info: '#0288D1',
  infoBg: '#E1F5FE',
} as const;

export const DFARM_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const DFARM_RADIUS = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 9999,
} as const;

export const DFARM_SHADOWS = {
  // Clay 3D Raised Card Shadow: Diffuse warm colored glow + subtle gravity drop
  clayCard: {
    shadowColor: '#F58A38',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 5,
  },
  clayCardActive: {
    shadowColor: '#FF6A00',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 7,
  },
  // Clay Button Shadow: Dynamic tactile push
  clayButton: {
    shadowColor: '#FF6A00',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 6,
  },
  claySecondaryButton: {
    shadowColor: '#211B18',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  // Floating Tab Bar Shadow
  clayTabBar: {
    shadowColor: '#211B18',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 10,
  },
} as const;

export const DFARM_TYPOGRAPHY = {
  h1: {
    fontSize: 26,
    fontWeight: '700' as const,
    lineHeight: 32,
    color: DFARM_COLORS.primaryText,
  },
  h2: {
    fontSize: 20,
    fontWeight: '700' as const,
    lineHeight: 26,
    color: DFARM_COLORS.primaryText,
  },
  h3: {
    fontSize: 17,
    fontWeight: '600' as const,
    lineHeight: 22,
    color: DFARM_COLORS.primaryText,
  },
  bodyLg: {
    fontSize: 15,
    fontWeight: '500' as const,
    lineHeight: 21,
    color: DFARM_COLORS.primaryText,
  },
  bodyMd: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
    color: DFARM_COLORS.secondaryText,
  },
  bodySm: {
    fontSize: 11,
    fontWeight: '400' as const,
    lineHeight: 15,
    color: DFARM_COLORS.secondaryText,
  },
  numberDisplay: {
    fontSize: 30,
    fontWeight: '800' as const,
    lineHeight: 36,
    color: DFARM_COLORS.primaryOrange,
  },
  numberSub: {
    fontSize: 18,
    fontWeight: '700' as const,
    lineHeight: 22,
    color: DFARM_COLORS.primaryText,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 14,
  },
} as const;
