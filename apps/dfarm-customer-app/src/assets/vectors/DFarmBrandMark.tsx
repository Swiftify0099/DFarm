import React from 'react';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, SvgProps } from 'react-native-svg';
import { DFARM_COLORS } from '../../design-system/theme';

export interface VectorIconProps extends SvgProps {
  size?: number;
  color?: string;
}

export const DFarmBrandMark: React.FC<{ width?: number; height?: number }> = ({
  width = 170,
  height = 42,
}) => {
  return (
    <Svg width={width} height={height} viewBox="0 0 170 42" fill="none">
      <Defs>
        <LinearGradient id="dfarmBrandGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={DFARM_COLORS.primaryOrange} />
          <Stop offset="100%" stopColor={DFARM_COLORS.secondaryOrange} />
        </LinearGradient>
      </Defs>

      {/* Tactile Droplet & Leaf Symbol */}
      <Circle cx="21" cy="21" r="19" fill="#FFFFFF" stroke={DFARM_COLORS.border} strokeWidth="1.5" />
      {/* Specular rim */}
      <Path
        d="M6 14 C10 7, 32 7, 36 14"
        stroke="rgba(255, 255, 255, 0.9)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Organic Milk Drop Shape */}
      <Path
        d="M21 9 C21 9 12 21 12 26 C12 30.97 16.03 35 21 35 C25.97 35 30 30.97 30 26 C30 21 21 9 21 9 Z"
        fill="url(#dfarmBrandGrad)"
      />
      {/* Golden Cream Glow Center */}
      <Circle cx="18" cy="23" r="2.5" fill="#FFE9DC" opacity={0.85} />

      {/* DFARM Geometric Typography */}
      {/* D */}
      <Path
        d="M50 12 H62 C67.5 12 71 15.5 71 21 C71 26.5 67.5 30 62 30 H50 V12 Z M55 17 V25 H61.5 C64.2 25 66 23.5 66 21 C66 18.5 64.2 17 61.5 17 H55 Z"
        fill={DFARM_COLORS.primaryText}
      />
      {/* F */}
      <Path
        d="M76 12 H90 V16.5 H81 V19 H88 V23 H81 V30 H76 V12 Z"
        fill={DFARM_COLORS.primaryText}
      />
      {/* A */}
      <Path
        d="M100.5 12 H106.5 L113.5 30 H108 L106.8 26.5 H100.2 L99 30 H93.5 L100.5 12 Z M103.5 16.5 L101.4 22.5 H105.6 L103.5 16.5 Z"
        fill={DFARM_COLORS.primaryOrange}
      />
      {/* R */}
      <Path
        d="M118 12 H127.5 C131.5 12 134 14.5 134 18 C134 20.8 132.2 22.8 129.5 23.5 L135 30 H129 L124 24 H123 V30 H118 V12 Z M123 16 V20.5 H127 C128.8 20.5 129.8 19.6 129.8 18.2 C129.8 16.8 128.8 16 127 16 H123 Z"
        fill={DFARM_COLORS.primaryText}
      />
      {/* M */}
      <Path
        d="M139 12 H145 L149 21.5 L153 12 H159 V30 H154.5 V18 L150.8 26.5 H147.2 L143.5 18 V30 H139 V12 Z"
        fill={DFARM_COLORS.primaryText}
      />
    </Svg>
  );
};
