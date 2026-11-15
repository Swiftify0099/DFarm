import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';

interface MilkCategoryBadgeProps {
  category: string;
}

export const MilkCategoryBadge: React.FC<MilkCategoryBadgeProps> = ({ category }) => {
  const normalized = category ? category.toUpperCase() : '';

  let backgroundColor = '#F4E8FB';
  let textColor = '#6A1B9A';
  let borderColor = '#E0BCEB';
  let icon = '🥛';

  if (normalized === 'COW') {
    backgroundColor = '#FFF0E2';
    textColor = '#C2410C';
    borderColor = '#FED7AA';
    icon = '🐄';
  } else if (normalized === 'BUFFALO') {
    backgroundColor = '#EAEFF2';
    textColor = '#334155';
    borderColor = '#CBD5E1';
    icon = '🐃';
  }

  return (
    <View style={[styles.badge, { backgroundColor, borderColor }]}>
      <Text style={styles.badgeIcon}>{icon}</Text>
      <Text style={[styles.text, { color: textColor }]}>{normalized}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: clayRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
    borderBottomWidth: 1.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255,255,255,0.7)',
  },
  badgeIcon: {
    fontSize: 10,
    marginRight: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
