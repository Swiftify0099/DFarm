import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop, SvgProps } from 'react-native-svg';

export interface TopLeftLeavesProps extends SvgProps {
  width?: number;
  height?: number;
}

/**
 * Top-left decorative green leaf branch hanging into the screen.
 * Matches the reference design with fresh natural greens, subtle
 * veins and soft lighting.
 */
export const TopLeftLeaves: React.FC<TopLeftLeavesProps> = ({
  width = 110,
  height = 100,
  ...props
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 120 110"
      fill="none"
      {...props}
    >
      <Defs>
        <LinearGradient id="tlBranch" x1="0" y1="0" x2="80" y2="70" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#1B5E20" />
          <Stop offset="100%" stopColor="#388E3C" />
        </LinearGradient>
        <LinearGradient id="tlVibrant" x1="10" y1="10" x2="60" y2="70" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#2E7D32" />
          <Stop offset="60%" stopColor="#4CAF50" />
          <Stop offset="100%" stopColor="#81C784" />
        </LinearGradient>
        <LinearGradient id="tlBright" x1="0" y1="20" x2="50" y2="90" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#388E3C" />
          <Stop offset="60%" stopColor="#66BB6A" />
          <Stop offset="100%" stopColor="#A5D6A7" />
        </LinearGradient>
        <LinearGradient id="tlDeep" x1="0" y1="0" x2="35" y2="50" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#1B5E20" />
          <Stop offset="100%" stopColor="#2E7D32" />
        </LinearGradient>
      </Defs>

      {/* Main arching stems */}
      <Path
        d="M-5 -5 Q25 22 75 58"
        stroke="url(#tlBranch)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <Path
        d="M20 18 Q45 28 85 40"
        stroke="url(#tlBranch)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <Path
        d="M48 38 Q50 68 62 95"
        stroke="url(#tlBranch)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* Leaf 1: Main hanging center leaf */}
      <Path
        d="M75 58 C88 68 98 86 92 104 C74 100 62 82 75 58 Z"
        fill="url(#tlBright)"
      />
      <Path
        d="M76 64 C81 74 85 86 84 96"
        stroke="#E8F5E9"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity={0.8}
      />

      {/* Leaf 2: Upper right outward leaf */}
      <Path
        d="M85 40 C98 38 116 46 118 62 C102 65 88 54 85 40 Z"
        fill="url(#tlVibrant)"
      />
      <Path
        d="M89 44 C98 48 106 53 112 56"
        stroke="#E8F5E9"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity={0.75}
      />

      {/* Leaf 3: Drooping lower leaf */}
      <Path
        d="M62 95 C58 105 48 112 40 108 C38 96 48 88 62 95 Z"
        fill="url(#tlBright)"
      />

      {/* Leaf 4: Mid-branch leaf */}
      <Path
        d="M42 24 C56 16 72 20 80 32 C68 38 52 35 42 24 Z"
        fill="url(#tlDeep)"
      />
      <Path
        d="M48 24 C58 24 66 26 74 30"
        stroke="#C8E6C9"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity={0.75}
      />

      {/* Leaf 5: Small corner sprout */}
      <Path
        d="M16 8 C28 2 40 4 44 14 C34 18 24 16 16 8 Z"
        fill="url(#tlVibrant)"
      />
    </Svg>
  );
};
