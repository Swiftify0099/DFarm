import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, SvgProps } from 'react-native-svg';

export interface DFarmSproutBrandMarkProps {
  size?: number;
}

/**
 * DFarm sprout/leaf logo icon — three orange leaves radiating upward from
 * a common stem base. Matches the reference screenshot's orange leaf logo.
 */
export const DFarmSproutIcon: React.FC<SvgProps & { size?: number }> = ({
  size = 40,
  ...props
}) => {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      {...props}
    >
      <Defs>
        {/* Main orange gradient for leaves */}
        <LinearGradient id="leafOrange" x1="24" y1="48" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#E85500" />
          <Stop offset="50%" stopColor="#FF7700" />
          <Stop offset="100%" stopColor="#FFA040" />
        </LinearGradient>
        {/* Slightly lighter for right leaf */}
        <LinearGradient id="leafOrangeR" x1="48" y1="40" x2="10" y2="8" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#D94E00" />
          <Stop offset="100%" stopColor="#FF8C1A" />
        </LinearGradient>
        {/* Darker for left leaf */}
        <LinearGradient id="leafOrangeL" x1="0" y1="40" x2="38" y2="6" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor="#C84800" />
          <Stop offset="100%" stopColor="#FF7700" />
        </LinearGradient>
      </Defs>

      {/* LEFT leaf — curves to upper-left */}
      <Path
        d="M23 42 C20 30 10 18 4 10 C14 7 24 20 23 42 Z"
        fill="url(#leafOrangeL)"
      />
      {/* Left leaf central vein */}
      <Path
        d="M22 38 C17 28 12 20 7 13"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* CENTER leaf — rises straight up */}
      <Path
        d="M24 42 C22 26 28 10 40 4 C44 16 38 32 24 42 Z"
        fill="url(#leafOrange)"
      />
      {/* Center leaf central vein */}
      <Path
        d="M25 38 C29 26 34 16 38 8"
        stroke="rgba(255,255,255,0.75)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* RIGHT leaf — curves to upper-right */}
      <Path
        d="M25 42 C34 38 46 34 48 24 C40 20 30 28 25 42 Z"
        fill="url(#leafOrangeR)"
      />
      {/* Right leaf central vein */}
      <Path
        d="M27 40 C34 34 40 30 45 25"
        stroke="rgba(255,255,255,0.65)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />

      {/* Stem join at base */}
      <Path
        d="M22 42 C23 45 25 45 26 42 Z"
        fill="#C04000"
      />
    </Svg>
  );
};

export const DFarmSproutBrandMark: React.FC<DFarmSproutBrandMarkProps> = ({ size = 40 }) => {
  return (
    <View style={styles.container}>
      <View style={styles.logoRow}>
        <DFarmSproutIcon size={size} />
        <Text style={[styles.brandTitle, { fontSize: size * 0.88 }]}>
          DFarm
        </Text>
      </View>
      <Text style={styles.tagline}>Smart Dairy Transparency</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  brandTitle: {
    fontWeight: '800',
    color: '#1E1008',
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  tagline: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6A5A50',
    letterSpacing: 0.1,
    marginTop: 2,
  },
});
