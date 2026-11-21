import React from 'react';
import Svg, { Path, SvgProps } from 'react-native-svg';

export interface ChevronDownIconProps extends SvgProps {
  size?: number;
  color?: string;
}

export const ChevronDownIcon: React.FC<ChevronDownIconProps> = ({
  size = 10,
  color = '#1E1611',
  ...props
}) => {
  return (
    <Svg
      width={size}
      height={size * 0.6}
      viewBox="0 0 10 6"
      fill="none"
      {...props}
    >
      <Path
        d="M1 1L5 5L9 1"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};
