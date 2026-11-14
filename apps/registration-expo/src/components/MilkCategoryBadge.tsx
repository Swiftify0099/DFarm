import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface MilkCategoryBadgeProps {
  category: string;
}

export const MilkCategoryBadge: React.FC<MilkCategoryBadgeProps> = ({ category }) => {
  const normalized = category ? category.toUpperCase() : '';

  let backgroundColor = colors.categoryBothBg;
  let textColor = colors.categoryBothText;

  if (normalized === 'COW') {
    backgroundColor = colors.categoryCowBg;
    textColor = colors.categoryCowText;
  } else if (normalized === 'BUFFALO') {
    backgroundColor = colors.categoryBuffaloBg;
    textColor = colors.categoryBuffaloText;
  }

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{normalized}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
