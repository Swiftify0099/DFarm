import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { DFARM_COLORS } from '../../design-system/theme';
import { VectorIconProps } from './DFarmBrandMark';

export const HerdIcon: React.FC<VectorIconProps> = ({
  size = 40,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 44 36" fill="none" {...props}>
      <Defs>
        <LinearGradient id="herdGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FFF3E0" />
          <Stop offset="100%" stopColor="#E1F5FE" />
        </LinearGradient>
      </Defs>
      {/* Background Soft Pill */}
      <Path
        d="M2 18 C2 9, 9 2, 18 2 H26 C35 2, 42 9, 42 18 C42 27, 35 34, 26 34 H18 C9 34, 2 27, 2 18 Z"
        fill="url(#herdGrad)"
        stroke={DFARM_COLORS.border}
        strokeWidth="1"
      />

      {/* Cow Head (Left Offset) */}
      <Path d="M7 11 C5 7, 9 5, 10 7 Z" fill="#A1887F" />
      <Path d="M19 11 C21 7, 17 5, 16 7 Z" fill="#A1887F" />
      <Path
        d="M9 11 C9 9, 17 9, 17 11 C18 14, 18 19, 16 21 C15 23, 11 23, 10 21 C8 19, 8 14, 9 11 Z"
        fill="#FFFFFF"
        stroke={DFARM_COLORS.primaryOrange}
        strokeWidth="1.2"
      />
      <Circle cx="11.5" cy="15" r="1.1" fill="#211B18" />
      <Circle cx="15.5" cy="15" r="1.1" fill="#211B18" />
      <Path d="M10 19 C10 18, 17 18, 17 19 C17 21, 10 21, 10 19 Z" fill="#FFE9DC" />

      {/* Plus Connector Badge */}
      <Circle cx="22" cy="18" r="4.5" fill="#FFFFFF" stroke={DFARM_COLORS.border} strokeWidth="1" />
      <Path d="M22 15.5 V20.5 M19.5 18 H24.5" stroke={DFARM_COLORS.primaryOrange} strokeWidth="1.4" strokeLinecap="round" />

      {/* Buffalo Head (Right Offset) */}
      <Path d="M28 12 C25 8, 22 10, 23 14 Z" fill="#37474F" />
      <Path d="M36 12 C39 8, 42 10, 41 14 Z" fill="#37474F" />
      <Path
        d="M27 12 C27 10, 37 10, 37 12 C38 15, 38 20, 36 22 C34 24, 30 24, 28 22 C26 20, 26 15, 27 12 Z"
        fill="#455A64"
        stroke="#0277BD"
        strokeWidth="1.2"
      />
      <Circle cx="29.5" cy="16" r="1.1" fill="#ECEFF1" />
      <Circle cx="34.5" cy="16" r="1.1" fill="#ECEFF1" />
      <Path d="M28 20 C28 19, 36 19, 36 20 C36 22, 28 22, 28 20 Z" fill="#263238" />
    </Svg>
  );
};
