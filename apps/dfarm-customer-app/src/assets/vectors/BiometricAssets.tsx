import React from 'react';
import Svg, { Path, Circle, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';
import { DFARM_COLORS } from '../../design-system/theme';
import { VectorIconProps } from './DFarmBrandMark';

export const FaceOvalGuide: React.FC<{
  width?: number;
  height?: number;
  isAligned?: boolean;
}> = ({
  width = 240,
  height = 300,
  isAligned = true,
}) => {
  const guideColor = isAligned ? DFARM_COLORS.primaryOrange : '#B0BEC5';
  return (
    <Svg width={width} height={height} viewBox="0 0 240 300" fill="none">
      <Defs>
        <LinearGradient id="reticleGlow" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={guideColor} stopOpacity={0.8} />
          <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.2} />
        </LinearGradient>
      </Defs>

      {/* Outer 4 L-Brackets for Scanner Framing */}
      <Path d="M20 50 V25 H45" stroke={guideColor} strokeWidth="3" strokeLinecap="round" />
      <Path d="M220 50 V25 H195" stroke={guideColor} strokeWidth="3" strokeLinecap="round" />
      <Path d="M20 250 V275 H45" stroke={guideColor} strokeWidth="3" strokeLinecap="round" />
      <Path d="M220 250 V275 H195" stroke={guideColor} strokeWidth="3" strokeLinecap="round" />

      {/* Main Oval Guide with Specular Outer Glow */}
      <Path
        d="M120 30 C70 30, 35 85, 35 150 C35 215, 70 270, 120 270 C170 270, 205 215, 205 150 C205 85, 170 30, 120 30 Z"
        stroke={guideColor}
        strokeWidth="2.5"
        strokeDasharray={isAligned ? undefined : '6 6'}
      />

      {/* Subtle Inner Target Crosshair */}
      <Path d="M110 150 H130 M120 140 V160" stroke={guideColor} strokeWidth="1.5" strokeLinecap="round" opacity={0.6} />

      {/* 5 Biometric Landmark Indicator Target Circles (YuNet: Left Eye, Right Eye, Nose Tip, Left Mouth, Right Mouth) */}
      {isAligned && (
        <>
          {/* Left Eye Target */}
          <Circle cx="82" cy="115" r="4.5" stroke="#FFFFFF" strokeWidth="1.5" fill={DFARM_COLORS.primaryOrange} />
          {/* Right Eye Target */}
          <Circle cx="158" cy="115" r="4.5" stroke="#FFFFFF" strokeWidth="1.5" fill={DFARM_COLORS.primaryOrange} />
          {/* Nose Tip Target */}
          <Circle cx="120" cy="155" r="4" stroke="#FFFFFF" strokeWidth="1.5" fill={DFARM_COLORS.primaryOrange} />
          {/* Left Mouth Corner */}
          <Circle cx="92" cy="195" r="3.5" stroke="#FFFFFF" strokeWidth="1.2" fill={DFARM_COLORS.primaryOrange} />
          {/* Right Mouth Corner */}
          <Circle cx="148" cy="195" r="3.5" stroke="#FFFFFF" strokeWidth="1.2" fill={DFARM_COLORS.primaryOrange} />
        </>
      )}
    </Svg>
  );
};

export const BiometricSuccessBadge: React.FC<VectorIconProps> = ({
  size = 64,
  ...props
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none" {...props}>
      <Defs>
        <LinearGradient id="shieldGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#E8F5E9" />
          <Stop offset="100%" stopColor="#C8E6C9" />
        </LinearGradient>
      </Defs>
      {/* Shield Silhouette */}
      <Path
        d="M32 4 L56 14 V32 C56 46 46 56 32 60 C18 56 8 46 8 32 V14 L32 4 Z"
        fill="url(#shieldGrad)"
        stroke="#2E7D32"
        strokeWidth="2"
      />
      {/* Verified Checkmark */}
      <Path
        d="M20 32 L28 40 L44 24"
        stroke="#2E7D32"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Specular Highlight on Shield Top */}
      <Path
        d="M14 18 C20 12, 44 12, 50 18"
        stroke="rgba(255, 255, 255, 0.9)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
};

export const CameraPermissionIllustration: React.FC<{ size?: number }> = ({
  size = 96,
}) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96" fill="none">
      <Circle cx="48" cy="48" r="44" fill="#FFE9DC" stroke={DFARM_COLORS.border} strokeWidth="2" />
      {/* Camera Body */}
      <Rect x="22" y="32" width="52" height="38" rx="8" fill="#FFFFFF" stroke={DFARM_COLORS.primaryOrange} strokeWidth="2.5" />
      <Path d="M38 32 L42 24 H54 L58 32 Z" fill={DFARM_COLORS.primaryOrange} />
      {/* Lens Circle */}
      <Circle cx="48" cy="51" r="14" fill="#FFF5EE" stroke={DFARM_COLORS.primaryOrange} strokeWidth="2.5" />
      <Circle cx="48" cy="51" r="8" fill="#FF6A00" />
      <Circle cx="45" cy="48" r="2.5" fill="#FFFFFF" />
      {/* Flash */}
      <Circle cx="64" cy="40" r="3" fill="#F58A38" />
    </Svg>
  );
};
