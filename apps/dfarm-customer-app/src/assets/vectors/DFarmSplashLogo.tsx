import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, SvgProps } from 'react-native-svg';
import { DFARM_COLORS } from '../../design-system/theme';

export interface DFarmSplashLogoProps {
  sproutSize?: number;
  fontSize?: number;
  showTagline?: boolean;
}

/**
 * Clean 3-leaf sprout icon rendered in SVG with rich orange gradient,
 * white interior leaf veins and stem join.
 */
export const DFarmSplashSproutIcon: React.FC<SvgProps & { size?: number }> = ({
  size = 54,
  ...props
}) => {
  return (
    <Svg
      width={size}
      height={(size * 48) / 48}
      viewBox="0 0 48 48"
      fill="none"
      {...props}
    >
      <Defs>
        <LinearGradient id="sproutGradCenter" x1="24" y1="46" x2="24" y2="4" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#E65100" />
          <Stop offset="50%" stopColor="#FF6A00" />
          <Stop offset="100%" stopColor="#FFA726" />
        </LinearGradient>
        <LinearGradient id="sproutGradLeft" x1="22" y1="44" x2="6" y2="10" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#D84315" />
          <Stop offset="55%" stopColor="#F57C00" />
          <Stop offset="100%" stopColor="#FFB74D" />
        </LinearGradient>
        <LinearGradient id="sproutGradRight" x1="26" y1="44" x2="42" y2="10" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#E65100" />
          <Stop offset="55%" stopColor="#FF6A00" />
          <Stop offset="100%" stopColor="#FFA726" />
        </LinearGradient>
      </Defs>

      {/* Left Leaf — curves up-left */}
      <Path
        d="M23 42 C19 32 9 20 4 11 C15 8 24 20 23 42 Z"
        fill="url(#sproutGradLeft)"
      />
      <Path
        d="M22 38 C17 28 12 20 7 14"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity={0.88}
      />

      {/* Center Leaf — rises straight up, tallest */}
      <Path
        d="M24 43 C21 28 27 12 39 5 C43 18 37 34 24 43 Z"
        fill="url(#sproutGradCenter)"
      />
      <Path
        d="M25 39 C29 27 34 17 38 9"
        stroke="#FFFFFF"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity={0.92}
      />

      {/* Right Leaf — curves up-right */}
      <Path
        d="M25 42 C34 38 46 33 48 23 C40 19 30 27 25 42 Z"
        fill="url(#sproutGradRight)"
      />
      <Path
        d="M27 40 C34 34 40 30 45 25"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity={0.88}
      />

      {/* Stem base join */}
      <Path
        d="M22 42 C23 45 25 45 26 42 Z"
        fill="#BF360C"
      />
    </Svg>
  );
};

/**
 * Centered DFarm Brand Block for the Splash Screen:
 * 1. 3-leaf orange sprout icon centered on top
 * 2. "DFarm" bold title
 * 3. "—  Smart Dairy Transparency  —" flanked with subtle horizontal accent lines
 */
export const DFarmSplashLogo: React.FC<DFarmSplashLogoProps> = ({
  sproutSize = 54,
  fontSize = 42,
  showTagline = true,
}) => {
  return (
    <View style={styles.container}>
      {/* Centered Sprout Icon */}
      <DFarmSplashSproutIcon size={sproutSize} />

      {/* Wordmark */}
      <Text style={[styles.wordmark, { fontSize }]}>DFarm</Text>

      {/* Flanked Tagline */}
      {showTagline && (
        <View style={styles.taglineRow}>
          <View style={styles.flankLine} />
          <Text style={styles.taglineText}>Smart Dairy Transparency</Text>
          <View style={styles.flankLine} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: 'System',
    fontWeight: '800',
    color: DFARM_COLORS.primaryText,
    letterSpacing: -0.6,
    marginTop: 8,
    marginBottom: 6,
    includeFontPadding: false,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  flankLine: {
    width: 32,
    height: 1.2,
    backgroundColor: '#D1C6BD',
    borderRadius: 1,
  },
  taglineText: {
    fontFamily: 'System',
    fontSize: 13,
    fontWeight: '600',
    color: '#6E645D',
    letterSpacing: 0.4,
    includeFontPadding: false,
  },
});
