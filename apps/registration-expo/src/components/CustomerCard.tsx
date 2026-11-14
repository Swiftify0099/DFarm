import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CustomerDto } from '../types/models';
import { colors } from '../theme/colors';
import { StatusBadge } from './StatusBadge';
import { MilkCategoryBadge } from './MilkCategoryBadge';

interface CustomerCardProps {
  customer: CustomerDto;
  onPress: () => void;
}

export const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onPress }) => {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.card}
      onPress={onPress}
    >
      <View style={styles.row}>
        {/* Person Icon Badge */}
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>👤</Text>
        </View>

        {/* Content details */}
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.fullName} numberOfLines={1}>
              {customer.fullName}
            </Text>
            <StatusBadge status={customer.status} />
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.mobile}>{customer.normalizedMobileNumber}</Text>
            {customer.farmerCode ? (
              <Text style={styles.farmerCode}> • {customer.farmerCode}</Text>
            ) : null}
          </View>

          <View style={styles.footerRow}>
            <View style={styles.categoriesRow}>
              {(customer.permittedCategories || []).map((cat) => (
                <MilkCategoryBadge key={cat} category={cat} />
              ))}
            </View>
            {customer.address?.village ? (
              <Text style={styles.village} numberOfLines={1}>
                📍 {customer.address.village}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Chevron */}
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#ECEFF1',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconText: {
    fontSize: 22,
    color: colors.onPrimaryContainer,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fullName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onSurface,
    flex: 1,
    marginRight: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  mobile: {
    fontSize: 14,
    color: colors.onSurfaceVariant,
  },
  farmerCode: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  categoriesRow: {
    flexDirection: 'row',
    gap: 6,
  },
  village: {
    fontSize: 12,
    color: colors.outline,
    flexShrink: 1,
  },
  chevron: {
    fontSize: 24,
    color: colors.outline,
    marginLeft: 8,
    fontWeight: '300',
  },
});
