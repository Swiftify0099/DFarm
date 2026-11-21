import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { DFARM_COLORS } from '../../design-system/theme';
import { VectorIconProps } from './DFarmBrandMark';

export const LocationPinIcon: React.FC<VectorIconProps> = ({
  size = 28,
  color = DFARM_COLORS.primaryOrange,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" fill="none" {...props}>
      <Defs>
        <LinearGradient id="pinGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={DFARM_COLORS.primaryOrange} />
          <Stop offset="100%" stopColor={DFARM_COLORS.secondaryOrange} />
        </LinearGradient>
      </Defs>
      {/* Soft Ground Shadow */}
      <Circle cx="14" cy="24" r="5" fill="rgba(245, 138, 56, 0.25)" />
      {/* Tactile Pin Body */}
      <Path
        d="M14 2 C8.48 2 4 6.48 4 12 C4 18.5 13 24.5 14 25 C15 24.5 24 18.5 24 12 C24 6.48 19.52 2 14 2 Z"
        fill="url(#pinGrad)"
        stroke="#FFFFFF"
        strokeWidth="1.2"
      />
      {/* Center Milk Drop Cavity */}
      <Circle cx="14" cy="11" r="4.5" fill="#FFFFFF" />
      <Path
        d="M14 8.5 C14 8.5 11.5 12 11.5 13.2 C11.5 14.5 12.6 15.5 14 15.5 C15.4 15.5 16.5 14.5 16.5 13.2 C16.5 12 14 8.5 14 8.5 Z"
        fill={color}
      />
    </Svg>
  );
};

export const GpsPulseIcon: React.FC<VectorIconProps> = ({
  size = 24,
  color = DFARM_COLORS.primaryOrange,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity={0.4} />
      <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth="1.5" opacity={0.7} />
      <Circle cx="12" cy="12" r="3" fill={color} />
      <Path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
};

export const DairyCenterIcon: React.FC<VectorIconProps> = ({
  size = 40,
  color = DFARM_COLORS.primaryOrange,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" {...props}>
      <Circle cx="20" cy="20" r="19" fill="#FFF9F5" stroke={DFARM_COLORS.border} strokeWidth="1.5" />
      {/* Silo Milk Tank */}
      <Path d="M10 18 C10 14, 16 14, 16 18 V28 H10 V18 Z" fill="#FFE9DC" stroke={color} strokeWidth="1.2" />
      <Path d="M10 18 C10 16, 16 16, 16 18" stroke={color} strokeWidth="1.2" />
      {/* Center Building */}
      <Path d="M15 15 L26 8 L32 12 V28 H15 V15 Z" fill="#FFFFFF" stroke={DFARM_COLORS.primaryText} strokeWidth="1.5" />
      {/* Door */}
      <Path d="M21 21 H26 V28 H21 V21 Z" fill={color} />
      {/* Droplet Insignia above building */}
      <Circle cx="25" cy="16" r="2" fill={DFARM_COLORS.secondaryOrange} />
    </Svg>
  );
};
