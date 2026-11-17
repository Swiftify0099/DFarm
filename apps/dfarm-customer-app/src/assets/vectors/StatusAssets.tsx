import React from 'react';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { DFARM_COLORS } from '../../design-system/theme';

export const StatusPendingIllustration: React.FC<{ size?: number }> = ({
  size = 80,
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <Defs>
        <LinearGradient id="pendingBowlGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FFF3E0" />
          <Stop offset="100%" stopColor="#FFE0B2" />
        </LinearGradient>
      </Defs>
      {/* Background Soft Bowl */}
      <Circle cx="40" cy="40" r="38" fill="url(#pendingBowlGrad)" stroke="#FFE0B2" strokeWidth="1.5" />
      {/* Clock / Hourglass Outline */}
      <Circle cx="40" cy="40" r="22" fill="#FFFFFF" stroke={DFARM_COLORS.primaryOrange} strokeWidth="2.5" />
      {/* Hour & Minute Hands */}
      <Path d="M40 26 V40 L50 44" stroke={DFARM_COLORS.primaryOrange} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="40" cy="40" r="3" fill={DFARM_COLORS.primaryOrange} />
      {/* Specular Highlight */}
      <Path d="M26 24 C34 18, 48 18, 56 24" stroke="rgba(255, 255, 255, 0.9)" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
};

export const StatusApprovedIllustration: React.FC<{ size?: number }> = ({
  size = 80,
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <Defs>
        <LinearGradient id="approvedBowlGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#E8F5E9" />
          <Stop offset="100%" stopColor="#C8E6C9" />
        </LinearGradient>
      </Defs>
      <Circle cx="40" cy="40" r="38" fill="url(#approvedBowlGrad)" stroke="#C8E6C9" strokeWidth="1.5" />
      <Circle cx="40" cy="40" r="22" fill="#2E7D32" />
      <Path d="M28 40 L36 48 L53 31" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M24 22 C32 16, 48 16, 56 22" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
};

export const StatusRejectedIllustration: React.FC<{ size?: number }> = ({
  size = 80,
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <Defs>
        <LinearGradient id="rejectedBowlGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FFEBEE" />
          <Stop offset="100%" stopColor="#FFCDD2" />
        </LinearGradient>
      </Defs>
      <Circle cx="40" cy="40" r="38" fill="url(#rejectedBowlGrad)" stroke="#FFCDD2" strokeWidth="1.5" />
      <Circle cx="40" cy="40" r="22" fill="#D32F2F" />
      <Path d="M30 30 L50 50 M50 30 L30 50" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
      <Path d="M24 22 C32 16, 48 16, 56 22" stroke="rgba(255, 255, 255, 0.7)" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
};
