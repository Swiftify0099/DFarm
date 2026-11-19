import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop, SvgProps } from 'react-native-svg';

export interface ShieldCheckIconProps extends SvgProps {
  size?: number;
}

export const ShieldCheckIcon: React.FC<ShieldCheckIconProps> = ({
  size = 14,
  ...props
}) => {
  return (
    <Svg
      width={size}
      height={size * 1.125}
      viewBox="0 0 16 18"
      fill="none"
      {...props}
    >
      <Defs>
        <LinearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#43A047" />
          <Stop offset="100%" stopColor="#2E7D32" />
        </LinearGradient>
      </Defs>
      {/* Shield Outline with subtle tint */}
      <Path
        d="M8 1.5L2 3.8V8.6C2 12.3 4.6 15.8 8 17C11.4 15.8 14 12.3 14 8.6V3.8L8 1.5Z"
        stroke="url(#shieldGrad)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="#E8F5E9"
        fillOpacity={0.35}
      />
      {/* Checkmark inside Shield */}
      <Path
        d="M5.2 8.8L7.2 10.8L11 6.8"
        stroke="#2E7D32"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};
