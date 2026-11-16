import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_SHADOWS, DFARM_TYPOGRAPHY } from './theme';

export interface ClayHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  rightElement?: React.ReactNode;
}

export const ClayHeader: React.FC<ClayHeaderProps> = ({
  title,
  subtitle,
  onBack,
  rightElement,
}) => {
  return (
    <View style={styles.header}>
      <View style={styles.leftRow}>
        {onBack && (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
        )}
        <View style={styles.titleColumn}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {rightElement && <View style={styles.rightContainer}>{rightElement}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: DFARM_COLORS.primaryCream,
    borderBottomWidth: 1,
    borderBottomColor: DFARM_COLORS.border,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: DFARM_RADIUS.sm,
    backgroundColor: DFARM_COLORS.surfaceWhite,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    ...DFARM_SHADOWS.clayCard,
  },
  backButtonPressed: {
    transform: [{ scale: 0.94 }],
  },
  backArrow: {
    fontSize: 20,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  titleColumn: {
    flex: 1,
  },
  title: {
    ...DFARM_TYPOGRAPHY.h2,
    color: DFARM_COLORS.primaryText,
  },
  subtitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginTop: 2,
  },
  rightContainer: {
    marginLeft: 8,
  },
});
