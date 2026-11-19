import React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';
import { DFARM_COLORS } from '../../design-system/theme';

export interface CurvedPastureDividerProps extends SvgProps {
  width?: number | string;
  height?: number;
  fillColor?: string;
}

/**
 * Organic curved wave that sits at the junction between the hero farm illustration
 * and the lower cream brand card, matching the subtle crest in the reference design.
 */
export const CurvedPastureDivider: React.FC<CurvedPastureDividerProps> = ({
  width = '100%',
  height = 36,
  fillColor = DFARM_COLORS.primaryCream,
  ...props
}) => {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 375 36"
      preserveAspectRatio="none"
      fill="none"
      {...props}
    >
      {/* Smooth organic wave transitioning down to solid cream */}
      <Path
        d="M0 24 C100 4, 275 38, 375 14 L375 36 L0 36 Z"
        fill={fillColor}
      />
    </Svg>
  );
};
