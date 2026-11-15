import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Customer, IdentificationMethod } from '../../types';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { ClayCard } from './ClayCard';
import { ClayStatusBadge } from './ClayStatusBadge';
import { ClayCategoryBadge } from './ClayCategoryBadge';

export interface ClayCustomerCardProps {
  customer: Customer;
  method?: IdentificationMethod;
  centerName?: string;
  style?: ViewStyle;
}

export const ClayCustomerCard: React.FC<ClayCustomerCardProps> = ({
  customer,
  method,
  centerName,
  style,
}) => {
  // Extract initials from customer full name
  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (parts[0]?.substring(0, 2) || 'DF').toUpperCase();
  };

  const getMethodLabel = (m?: IdentificationMethod): { label: string; icon: string } => {
    switch (m) {
      case 'FACE':
        return { label: 'FACE BIOMETRIC', icon: '📸' };
      case 'RFID':
        return { label: 'RFID CARD TAP', icon: '💳' };
      case 'SUPERVISOR_MANUAL':
        return { label: 'SUPERVISOR VERIFIED', icon: '🛡️' };
      default:
        return { label: 'VERIFIED', icon: '✓' };
    }
  };

  const methodInfo = getMethodLabel(method);

  return (
    <ClayCard variant="elevated" style={[styles.card, style]}>
      {/* Top Identity Row */}
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(customer.fullName)}</Text>
        </View>

        <View style={styles.infoCol}>
          <View style={styles.codeRow}>
            <Text style={styles.farmerCode}>{customer.farmerCode}</Text>
            <ClayStatusBadge status={customer.status} />
          </View>
          <Text style={typography.headlineMedium} numberOfLines={1}>
            {customer.fullName}
          </Text>
          {customer.mobileNumber ? (
            <Text style={styles.mobileText}>📱 {customer.mobileNumber}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.divider} />

      {/* Details Grid */}
      <View style={styles.detailsGrid}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>AUTH METHOD</Text>
          <View style={styles.methodBadge}>
            <Text style={styles.methodIcon}>{methodInfo.icon}</Text>
            <Text style={styles.methodText}>{methodInfo.label}</Text>
          </View>
        </View>

        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>AUTHORIZED MILK</Text>
          <View style={styles.categoryBadgesRow}>
            {customer.permittedCategories.map((cat) => (
              <ClayCategoryBadge key={cat} category={cat} size="sm" />
            ))}
          </View>
        </View>

        {centerName ? (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>CENTER</Text>
            <Text style={styles.detailValue}>{centerName}</Text>
          </View>
        ) : null}
      </View>
    </ClayCard>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: 20,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.clayGreen,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 3,
    borderRightWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.4)',
    borderLeftColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomColor: '#0E3711',
    borderRightColor: '#0E3711',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  infoCol: {
    flex: 1,
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  farmerCode: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.accentAmber,
    letterSpacing: 0.5,
  },
  mobileText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 16,
  },
  detailsGrid: {
    gap: 12,
  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  methodIcon: {
    fontSize: 12,
  },
  methodText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.4,
  },
  categoryBadgesRow: {
    flexDirection: 'row',
    gap: 6,
  },
});
