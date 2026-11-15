import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { clayBorderRadius, clayShadows } from '../../theme/clay';

export interface ClayReceiptCardProps {
  receiptText: string;
  reprintCount?: number;
  printerStatus?: string;
  style?: ViewStyle;
}

export const ClayReceiptCard: React.FC<ClayReceiptCardProps> = ({
  receiptText,
  reprintCount = 0,
  printerStatus,
  style,
}) => {
  return (
    <View style={[styles.outerContainer, style]}>
      {/* Printer Status Ribbon */}
      {printerStatus && (
        <View style={styles.statusBar}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{printerStatus}</Text>
        </View>
      )}

      {/* Tactile Receipt Slip */}
      <View style={styles.paperContainer}>
        {/* Top Paper Tear Indicator */}
        <View style={styles.tearStrip}>
          {Array.from({ length: 22 }).map((_, i) => (
            <View key={i} style={styles.tearTriangle} />
          ))}
        </View>

        <View style={styles.slipContent}>
          {reprintCount > 0 && (
            <View style={styles.reprintBadge}>
              <Text style={styles.reprintText}>
                *** DUPLICATE REPRINT #{reprintCount} ***
              </Text>
            </View>
          )}

          <Text style={typography.monospaceReceipt}>{receiptText}</Text>
        </View>

        {/* Bottom Paper Tear Indicator */}
        <View style={styles.tearStripBottom}>
          {Array.from({ length: 22 }).map((_, i) => (
            <View key={i} style={styles.tearTriangleBottom} />
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 136, 209, 0.15)',
    borderColor: 'rgba(2, 136, 209, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.clayBlueLight,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.clayBlueLight,
    letterSpacing: 0.3,
  },
  paperContainer: {
    width: '100%',
    backgroundColor: '#1E2530',
    borderRadius: clayBorderRadius.sm,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 2.5,
    borderRightWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.16)',
    borderLeftColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomColor: 'rgba(0, 0, 0, 0.5)',
    borderRightColor: 'rgba(0, 0, 0, 0.3)',
    overflow: 'hidden',
    ...clayShadows.raisedMd,
  },
  tearStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 6,
    backgroundColor: '#161C24',
    overflow: 'hidden',
  },
  tearTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#1E2530',
  },
  tearStripBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    height: 6,
    backgroundColor: '#161C24',
    overflow: 'hidden',
  },
  tearTriangleBottom: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1E2530',
  },
  slipContent: {
    padding: 20,
  },
  reprintBadge: {
    backgroundColor: 'rgba(255, 143, 0, 0.2)',
    borderColor: colors.accentAmber,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  reprintText: {
    color: colors.accentAmber,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
