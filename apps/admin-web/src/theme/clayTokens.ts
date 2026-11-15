/**
 * DFARM Admin Web — Semantic Design Tokens
 * 100% Aligned with Registration Expo & Collection Expo Theme Tokens
 * Formatted for Web & Claymorphism 3D Elevation Surfaces
 */

export const clayColors = {
  // Brand Primaries (Registration Expo Jetpack / M3 parity)
  primary: '#00506E',
  primaryHover: '#003F57',
  primaryContainer: '#23759B',
  onPrimary: '#FFFFFF',
  
  // Agricultural Dairy Green (Collection Expo parity)
  primaryGreen: '#1B5E20',
  primaryGreenHover: '#144618',
  primaryLight: '#4C8C4A',
  
  // Accents
  accentAmber: '#FF8F00',
  accentAmberLight: '#FFF8E1',
  accentTeal: '#0D9488',
  accentSky: '#0284C7',
  accentIndigo: '#4F46E5',
  
  // Neutral Surfaces (Claymorphism Dual Light Backgrounds)
  background: '#F4F7FB',
  backgroundAlt: '#EBF1F7',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceInset: '#EDF2F7',
  surfaceMuted: '#F8FAFC',
  
  // Typography Neutrals
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textWhite: '#FFFFFF',
  
  // Borders
  borderLight: 'rgba(255, 255, 255, 0.9)',
  borderSubtle: '#E2E8F0',
  borderHighlight: 'rgba(255, 255, 255, 0.95)',
  
  // Status Badges & States (DisplayComponents.kt parity)
  status: {
    activeBg: '#E6F4EA',
    activeText: '#137333',
    draftBg: '#FEF7E0',
    draftText: '#B06000',
    pendingBg: '#E8F0FE',
    pendingText: '#1A73E8',
    suspendedBg: '#FCE8E6',
    suspendedText: '#C5221F',
    defaultBg: '#F1F3F4',
    defaultText: '#5F6368',
  },
  
  // Milk Category Tokens
  category: {
    cowBg: '#FFF3E0',
    cowText: '#E65100',
    buffaloBg: '#ECEFF1',
    buffaloText: '#37474F',
    bothBg: '#F3E5F5',
    bothText: '#6A1B9A',
  },
} as const;

export const clayShadows = {
  // Soft raised clay surface with top-left specular highlight and bottom-right depth
  card: '8px 12px 24px -4px rgba(15, 23, 42, 0.06), 2px 4px 8px -2px rgba(15, 23, 42, 0.04), inset 1px 1px 2px 0px rgba(255, 255, 255, 0.9), inset -1px -1px 3px 0px rgba(0, 0, 0, 0.03)',
  cardHover: '12px 18px 30px -4px rgba(15, 23, 42, 0.09), 4px 6px 12px -2px rgba(15, 23, 42, 0.05), inset 1px 1px 3px 0px rgba(255, 255, 255, 1), inset -1px -1px 4px 0px rgba(0, 0, 0, 0.04)',
  
  // Inset fields (inputs, search, tables, progress grooves)
  inset: 'inset 2px 2px 5px rgba(15, 23, 42, 0.06), inset -2px -2px 5px rgba(255, 255, 255, 0.85)',
  insetFocus: 'inset 2px 2px 4px rgba(0, 80, 110, 0.12), inset -2px -2px 4px rgba(255, 255, 255, 0.9), 0 0 0 3px rgba(0, 80, 110, 0.15)',
  
  // Raised 3D tactile buttons
  buttonPrimary: '0 6px 16px -2px rgba(0, 80, 110, 0.35), 0 2px 4px -1px rgba(0, 80, 110, 0.2), inset 0 2px 2px rgba(255, 255, 255, 0.35), inset 0 -2px 4px rgba(0, 0, 0, 0.2)',
  buttonPrimaryActive: 'inset 0 3px 6px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 80, 110, 0.2)',
  buttonSecondary: '0 4px 12px -2px rgba(15, 23, 42, 0.07), inset 0 1.5px 2px rgba(255, 255, 255, 0.95), inset 0 -2px 3px rgba(15, 23, 42, 0.04)',
  buttonSecondaryActive: 'inset 0 2px 4px rgba(15, 23, 42, 0.1)',
  
  // Modals & Floating Dialogs
  modal: '0 25px 60px -15px rgba(15, 23, 42, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.85) inset, 0 10px 20px -5px rgba(15, 23, 42, 0.08)',
  
  // Badges & Pills
  badge: '0 2px 6px -1px rgba(15, 23, 42, 0.06), inset 0 1px 1px rgba(255, 255, 255, 0.8)',
};

export const clayRadius = {
  xs: '6px',
  sm: '10px',
  md: '14px',
  lg: '18px',
  xl: '22px',
  '2xl': '26px',
  '3xl': '32px',
  pill: '9999px',
};
