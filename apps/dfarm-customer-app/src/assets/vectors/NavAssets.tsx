import React from 'react';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { DFARM_COLORS } from '../../design-system/theme';
import { VectorIconProps } from './DFarmBrandMark';

export const NavHomeIcon: React.FC<VectorIconProps> = ({
  size = 24,
  color = DFARM_COLORS.secondaryText,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M3 10.5 L12 3 L21 10.5 V20 C21 20.6 20.6 21 20 21 H15 V14 H9 V21 H4 C3.4 21 3 20.6 3 20 V10.5 Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

export const NavMilkIcon: React.FC<VectorIconProps> = ({
  size = 24,
  color = DFARM_COLORS.secondaryText,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      {/* Milk Can Lid */}
      <Path d="M8 3 H16 V5 H8 V3 Z" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      {/* Neck */}
      <Path d="M9 5 L7 8 H17 L15 5" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      {/* Body */}
      <Path d="M7 8 V19 C7 20.1 7.9 21 9 21 H15 C16.1 21 17 20.1 17 19 V8" stroke={color} strokeWidth="1.8" />
      {/* Handles */}
      <Path d="M5 10 C4 11, 4 14, 7 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <Path d="M19 10 C20 11, 20 14, 17 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* Center drop line */}
      <Path d="M12 12 C12 12 10 15 10 16.2 C10 17.2 10.9 18 12 18 C13.1 18 14 17.2 14 16.2 C14 15 12 12 12 12 Z" fill={color} />
    </Svg>
  );
};

export const NavKhataIcon: React.FC<VectorIconProps> = ({
  size = 24,
  color = DFARM_COLORS.secondaryText,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      {/* Passbook / Ledger Book */}
      <Rect x="4" y="3" width="16" height="18" rx="2" stroke={color} strokeWidth="1.8" />
      <Path d="M4 7 H20" stroke={color} strokeWidth="1.5" />
      {/* Spine Bindings */}
      <Path d="M8 3 V21" stroke={color} strokeWidth="1.5" strokeDasharray="2 2" />
      {/* Rupee Symbol */}
      <Path d="M12 10 H16 M12 12.5 H15.5 C16.5 12.5 16.5 14.5 15.5 14.5 H12 L16 18" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

export const NavBillsIcon: React.FC<VectorIconProps> = ({
  size = 24,
  color = DFARM_COLORS.secondaryText,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      {/* Receipt with Serrated Bottom */}
      <Path
        d="M5 3 H19 V19 L16.5 17.5 L14 19 L12 17.5 L9.5 19 L7 17.5 L5 19 V3 Z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <Path d="M8 7 H16 M8 10.5 H16 M8 14 H13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
};

export const NavProfileIcon: React.FC<VectorIconProps> = ({
  size = 24,
  color = DFARM_COLORS.secondaryText,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Circle cx="12" cy="7" r="4" stroke={color} strokeWidth="1.8" />
      <Path d="M4 20 C4 16 7.6 14 12 14 C16.4 14 20 16 20 20" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
};

export const ShiftSunIcon: React.FC<VectorIconProps> = ({
  size = 20,
  color = DFARM_COLORS.primaryOrange,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" {...props}>
      <Circle cx="10" cy="10" r="4.5" fill={color} />
      <Path d="M10 1.5 V3.5 M10 16.5 V18.5 M1.5 10 H3.5 M16.5 10 H18.5 M4 4 L5.5 5.5 M14.5 14.5 L16 16 M4 16 L5.5 14.5 M14.5 5.5 L16 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
};

export const ShiftMoonIcon: React.FC<VectorIconProps> = ({
  size = 20,
  color = '#5C6BC0',
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" {...props}>
      <Path
        d="M15 11 C14.5 14.5 11.5 17 8 17 C4.1 17 1 13.9 1 10 C1 6.5 3.5 3.5 7 3 C6.5 4.5 6.5 6.5 7.5 8 C8.8 9.8 11.2 10.8 15 11 Z"
        fill={color}
      />
    </Svg>
  );
};

export const ReceiptSealIcon: React.FC<VectorIconProps> = ({
  size = 32,
  color = '#2E7D32',
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none" {...props}>
      <Circle cx="16" cy="16" r="14" stroke={color} strokeWidth="1.5" strokeDasharray="3 2" />
      <Circle cx="16" cy="16" r="11" fill="#E8F5E9" stroke={color} strokeWidth="1" />
      <Path d="M11 16 L14.5 19.5 L21 13" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};
