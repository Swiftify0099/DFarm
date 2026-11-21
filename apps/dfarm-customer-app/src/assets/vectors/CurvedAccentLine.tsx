import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop, SvgProps } from 'react-native-svg';

export interface CurvedAccentLineProps extends SvgProps {
  width?: number;
  height?: number;
}

/**
 * Subtle curved orange accent arc displayed beneath
 * "Building a Smarter Dairy Ecosystem Together".
 * Tapered ends with smooth golden-orange gradient.
 */
export const CurvedAccentLine: React.FC<CurvedAccentLineProps> = ({
  width = 160,
  height = 12,
  ...props
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 160 12"
      fill="none"
      {...props}
    >
      <Defs>
        <LinearGradient id="accentArcGrad" x1="0" y1="0" x2="160" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#FF6A00" stopOpacity={0.0} />
          <Stop offset="20%" stopColor="#FF6A00" stopOpacity={0.65} />
          <Stop offset="50%" stopColor="#FF7A1A" stopOpacity={0.9} />
          <Stop offset="80%" stopColor="#FFA040" stopOpacity={0.65} />
          <Stop offset="100%" stopColor="#FFA040" stopOpacity={0.0} />
        </LinearGradient>
      </Defs>

      {/* Gentle crescent arc with tapered ends */}
      <Path
        d="M6 3 Q80 12 154 3 Q80 7 6 3 Z"
        fill="url(#accentArcGrad)"
      />
    </Svg>
  );
};
