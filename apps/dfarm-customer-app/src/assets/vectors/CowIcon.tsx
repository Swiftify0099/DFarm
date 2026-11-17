import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { DFARM_COLORS } from '../../design-system/theme';
import { VectorIconProps } from './DFarmBrandMark';

export const CowIcon: React.FC<VectorIconProps> = ({
  size = 36,
  color = DFARM_COLORS.primaryOrange,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none" {...props}>
      <Defs>
        <LinearGradient id="cowGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FFF3E0" />
          <Stop offset="100%" stopColor="#FFE0B2" />
        </LinearGradient>
      </Defs>
      {/* Background Soft Pill */}
      <Circle cx="18" cy="18" r="17" fill="url(#cowGrad)" stroke="#FFE0B2" strokeWidth="1" />
      {/* Cow Horns */}
      <Path
        d="M10 13 C8 7, 12 5, 13 8 C13 10, 11 12, 10 13 Z"
        fill="#A1887F"
      />
      <Path
        d="M26 13 C28 7, 24 5, 23 8 C23 10, 25 12, 26 13 Z"
        fill="#A1887F"
      />
      {/* Cow Ears */}
      <Path
        d="M8 15 C5 16, 4 20, 9 18 Z"
        fill={color}
      />
      <Path
        d="M28 15 C31 16, 32 20, 27 18 Z"
        fill={color}
      />
      {/* Cow Head Base */}
      <Path
        d="M12 12 C12 10, 24 10, 24 12 C25 16, 25 22, 23 25 C21 28, 15 28, 13 25 C11 22, 11 16, 12 12 Z"
        fill="#FFFFFF"
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Spot */}
      <Path
        d="M13 14 C14 13, 17 13, 17 16 C17 18, 14 19, 13 18 Z"
        fill={color}
        opacity={0.85}
      />
      {/* Eyes */}
      <Circle cx="15" cy="17" r="1.5" fill="#211B18" />
      <Circle cx="21" cy="17" r="1.5" fill="#211B18" />
      {/* Muzzle */}
      <Path
        d="M14 22 C14 20, 22 20, 22 22 C22 25, 14 25, 14 22 Z"
        fill="#FFE9DC"
        stroke={color}
        strokeWidth="1"
      />
      {/* Nostrils */}
      <Circle cx="16.5" cy="22.5" r="0.8" fill="#5D4037" />
      <Circle cx="19.5" cy="22.5" r="0.8" fill="#5D4037" />
    </Svg>
  );
};
