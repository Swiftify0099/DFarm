import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { clayBorderRadius } from '../../theme/clay';
import { typography } from '../../theme/typography';

export interface ClayNumericDisplayProps {
  label: string;
  value: string | number;
  unit?: string;
  subValue?: string;
  badgeLabel?: string;
  badgeVariant?: 'success' | 'warning' | 'info' | 'neutral' | 'amber';
  highlightColor?: string;
  style?: ViewStyle;
}

export const ClayNumericDisplay: React.FC<ClayNumericDisplayProps> = ({
  label,
  value,
  unit,
  subValue,
  badgeLabel,
  badgeVariant = 'neutral',
  highlightColor = colors.textPrimary,
  style,
}) => {
  const getBadgeColors = () => {
    switch (badgeVariant) {
      case 'success':
        return { bg: 'rgba(76, 175, 80, 0.2)', border: colors.clayGreenLight, text: colors.clayGreenLight };
      case 'warning':
        return { bg: 'rgba(255, 160, 0, 0.2)', border: colors.statusWarning, text: colors.statusWarning };
      case 'amber':
        return { bg: 'rgba(255, 143, 0, 0.2)', border: colors.accentAmber, text: colors.accentAmber };
      case 'info':
        return { bg: 'rgba(2, 136, 209, 0.2)', border: colors.clayBlueLight, text: colors.clayBlueLight };
      case 'neutral':
      default:
        return { bg: 'rgba(255, 255, 255, 0.08)', border: 'rgba(255, 255, 255, 0.15)', text: colors.textSecondary };
    }
  };

  const badgeStyle = getBadgeColors();

  return (
    <View style={[styles.container, style]}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{label}</Text>
        {badgeLabel && (
          <View
            style={[
              styles.badge,
              { backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border },
            ]}
          >
            <Text style={[styles.badgeText, { color: badgeStyle.text }]}>
              {badgeLabel}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.displayWell}>
        <View style={styles.valueRow}>
          <Text style={[typography.displayMetric, { color: highlightColor }]}>
            {typeof value === 'number' ? value.toFixed(2) : value}
          </Text>
          {unit && (
            <View style={styles.unitPill}>
              <Text style={styles.unitText}>{unit}</Text>
            </View>
          )}
        </View>

        {subValue && <Text style={styles.subValue}>{subValue}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  displayWell: {
    backgroundColor: colors.clayInsetBg,
    borderRadius: clayBorderRadius.md,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopColor: colors.clayInsetBorderTop,
    borderLeftColor: colors.clayInsetBorderTop,
    borderBottomColor: colors.clayInsetBorderBottom,
    borderRightColor: colors.clayInsetBorderBottom,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  unitPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'center',
  },
  unitText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  subValue: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
