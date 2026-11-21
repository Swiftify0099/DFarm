import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop, SvgProps } from 'react-native-svg';

export interface BottomLeftWavesProps extends SvgProps {
  width?: number;
  height?: number;
}

/**
 * Bottom-left decorative orange/peach flowing wave asset.
 * Matches the reference screenshot composition: three layered
 * organic wave shapes rising from the bottom-left corner,
 * fading from deep orange at the bottom to transparent peach at top.
 */
export const BottomLeftWaves: React.FC<BottomLeftWavesProps> = ({
  width = 140,
  height = 90,
  ...props
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 140 90"
      fill="none"
      {...props}
    >
      <Defs>
        {/* Deep background wave — rich orange at bottom */}
        <LinearGradient id="wgBack" x1="0" y1="90" x2="100" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#F57200" stopOpacity={0.9} />
          <Stop offset="55%" stopColor="#FFB27A" stopOpacity={0.55} />
          <Stop offset="100%" stopColor="#FFD6B0" stopOpacity={0.08} />
        </LinearGradient>
        {/* Mid wave — warm amber */}
        <LinearGradient id="wgMid" x1="0" y1="90" x2="85" y2="10" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#FF8C00" stopOpacity={0.85} />
          <Stop offset="60%" stopColor="#FFBE82" stopOpacity={0.4} />
          <Stop offset="100%" stopColor="#FFE0B8" stopOpacity={0.05} />
        </LinearGradient>
        {/* Front wave — peach highlight */}
        <LinearGradient id="wgFront" x1="0" y1="90" x2="70" y2="20" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#FF6600" stopOpacity={0.75} />
          <Stop offset="50%" stopColor="#FFA060" stopOpacity={0.45} />
          <Stop offset="100%" stopColor="#FFD0A0" stopOpacity={0.0} />
        </LinearGradient>
      </Defs>

      {/* Wave 1 — deepest / tallest */}
      <Path
        d="M0 20 C18 14, 46 36, 72 24 C95 14, 118 40, 140 30 L140 90 L0 90 Z"
        fill="url(#wgBack)"
      />

      {/* Wave 2 — mid */}
      <Path
        d="M0 38 C22 30, 52 56, 82 42 C105 32, 128 54, 140 46 L140 90 L0 90 Z"
        fill="url(#wgMid)"
      />

      {/* Wave 3 — front / smallest */}
      <Path
        d="M0 56 C16 50, 38 70, 64 60 C80 54, 102 68, 118 62 L118 90 L0 90 Z"
        fill="url(#wgFront)"
      />
    </Svg>
  );
};
