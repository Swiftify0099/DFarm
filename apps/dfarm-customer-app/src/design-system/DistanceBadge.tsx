import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_TYPOGRAPHY } from './theme';
import { LocationPinIcon } from '../assets/vectors/LocationAssets';

export interface DistanceBadgeProps {
  distanceKm?: number | null;
  style?: StyleProp<ViewStyle>;
}

export const DistanceBadge: React.FC<DistanceBadgeProps> = ({ distanceKm, style }) => {
  if (distanceKm === undefined || distanceKm === null) return null;

  const label =
    distanceKm < 1
      ? `${Math.round(distanceKm * 1000)} m`
      : `${distanceKm.toFixed(1)} km`;

  return (
    <View style={[styles.badge, style]}>
      <LocationPinIcon size={14} color={DFARM_COLORS.primaryOrange} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderColor: '#FFE0B2',
    borderWidth: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: DFARM_RADIUS.pill,
    gap: 3,
  },
  text: {
    ...DFARM_TYPOGRAPHY.badge,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
  },
});
