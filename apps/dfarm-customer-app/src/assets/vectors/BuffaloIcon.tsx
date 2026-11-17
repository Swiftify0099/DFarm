import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { DFARM_COLORS } from '../../design-system/theme';
import { VectorIconProps } from './DFarmBrandMark';

export const BuffaloIcon: React.FC<VectorIconProps> = ({
  size = 36,
  color = '#0277BD',
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36" fill="none" {...props}>
      <Defs>
        <LinearGradient id="buffaloGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#E1F5FE" />
          <Stop offset="100%" stopColor="#B3E5FC" />
        </LinearGradient>
      </Defs>
      {/* Background Soft Pill */}
      <Circle cx="18" cy="18" r="17" fill="url(#buffaloGrad)" stroke="#B3E5FC" strokeWidth="1" />
      
      {/* Distinct Curved Buffalo Horns (Sweeping backwards & inwards) */}
      <Path
        d="M13 13 C9 7, 5 10, 6 15 C7 16, 9 14, 12 14 Z"
        fill="#37474F"
      />
      <Path
        d="M23 13 C27 7, 31 10, 30 15 C29 16, 27 14, 24 14 Z"
        fill="#37474F"
      />

      {/* Buffalo Drooping Ears */}
      <Path
        d="M9 16 C6 18, 5 21, 10 20 Z"
        fill="#455A64"
      />
      <Path
        d="M27 16 C30 18, 31 21, 26 20 Z"
        fill="#455A64"
      />

      {/* Buffalo Sturdy Head Base */}
      <Path
        d="M11 13 C11 10, 25 10, 25 13 C26 17, 26 23, 24 26 C22 28.5, 14 28.5, 12 26 C10 23, 10 17, 11 13 Z"
        fill="#455A64"
        stroke={color}
        strokeWidth="1.2"
      />

      {/* Forehead Star / Crescent Feature */}
      <Path
        d="M16 13 C17 12, 19 12, 20 13 C19 15, 17 15, 16 13 Z"
        fill="#ECEFF1"
      />

      {/* Eyes */}
      <Circle cx="14.5" cy="18" r="1.5" fill="#ECEFF1" />
      <Circle cx="14.5" cy="18" r="0.9" fill="#211B18" />
      <Circle cx="21.5" cy="18" r="1.5" fill="#ECEFF1" />
      <Circle cx="21.5" cy="18" r="0.9" fill="#211B18" />

      {/* Broad Muzzle */}
      <Path
        d="M13 23 C13 21, 23 21, 23 23 C23 26.5, 13 26.5, 13 23 Z"
        fill="#263238"
      />
      {/* Nostrils */}
      <Circle cx="15.5" cy="23.5" r="0.8" fill="#ECEFF1" opacity={0.8} />
      <Circle cx="20.5" cy="23.5" r="0.8" fill="#ECEFF1" opacity={0.8} />
    </Svg>
  );
};
