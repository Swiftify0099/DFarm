import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop, Ellipse, SvgProps } from 'react-native-svg';

export interface BottomRightLeavesProps extends SvgProps {
  width?: number;
  height?: number;
}

/**
 * Bottom-right decorative green leaf cluster.
 * Matches the reference screenshot: several pointed tropical leaves
 * rising from the bottom-right corner, natural greens with
 * bright highlights and central veins.
 */
export const BottomRightLeaves: React.FC<BottomRightLeavesProps> = ({
  width = 90,
  height = 85,
  ...props
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 90 85"
      fill="none"
      {...props}
    >
      <Defs>
        <LinearGradient id="lgDeep" x1="90" y1="85" x2="30" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#1B6B22" />
          <Stop offset="100%" stopColor="#4CAF50" />
        </LinearGradient>
        <LinearGradient id="lgMid" x1="90" y1="85" x2="20" y2="10" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#2E7D32" />
          <Stop offset="100%" stopColor="#66BB6A" />
        </LinearGradient>
        <LinearGradient id="lgLight" x1="90" y1="85" x2="40" y2="5" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#388E3C" />
          <Stop offset="100%" stopColor="#A5D6A7" />
        </LinearGradient>
        <LinearGradient id="lgSprout" x1="85" y1="80" x2="55" y2="30" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#43A047" />
          <Stop offset="100%" stopColor="#C8E6C9" />
        </LinearGradient>
      </Defs>

      {/* Main stem */}
      <Path
        d="M88 85 Q68 62 42 32"
        stroke="#2E7D32"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Leaf 1 — large, upper-left pointing */}
      <Path
        d="M42 32 C22 20 10 4 14 -4 C28 -2 42 18 42 32 Z"
        fill="url(#lgMid)"
      />
      <Path
        d="M40 28 C32 18 24 10 18 2"
        stroke="#A5D6A7"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity={0.85}
      />

      {/* Leaf 2 — mid-left outward */}
      <Path
        d="M58 50 C38 42 26 28 28 16 C42 16 56 36 58 50 Z"
        fill="url(#lgLight)"
      />
      <Path
        d="M55 44 C46 36 40 28 36 20"
        stroke="#C8E6C9"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity={0.85}
      />

      {/* Leaf 3 — upper right, tall */}
      <Path
        d="M64 44 C66 24 76 10 88 6 C90 22 80 38 64 44 Z"
        fill="url(#lgDeep)"
      />
      <Path
        d="M68 38 C74 28 80 18 84 12"
        stroke="#81C784"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity={0.85}
      />

      {/* Leaf 4 — lower sprout */}
      <Path
        d="M74 68 C60 64 50 54 52 44 C62 44 72 56 74 68 Z"
        fill="url(#lgSprout)"
      />
      <Path
        d="M70 62 C64 56 59 50 56 46"
        stroke="#E8F5E9"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity={0.8}
      />

      {/* Small accent leaf — rightmost */}
      <Path
        d="M82 56 C80 44 86 32 90 26 C92 38 90 50 82 56 Z"
        fill="url(#lgMid)"
        opacity={0.75}
      />
    </Svg>
  );
};
