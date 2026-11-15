import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { CustomerDto } from '../types/models';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';
import { StatusBadge } from './StatusBadge';
import { MilkCategoryBadge } from './MilkCategoryBadge';

interface CustomerCardProps {
  customer: CustomerDto;
  onPress: () => void;
}

export const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onPress }) => {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      style={[styles.card, isPressed && styles.cardPressed]}
      onPress={onPress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
    >
      <View style={styles.row}>
        {/* Clay Farmer Avatar Badge */}
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarIcon}>🧑‍🌾</Text>
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
              <View style={styles.codePill}>
                <Text style={styles.codeText}>{customer.farmerCode}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.footerRow}>
            <View style={styles.categoriesRow}>
              {(customer.permittedCategories || []).map((cat) => (
                <MilkCategoryBadge key={cat} category={cat} />
              ))}
            </View>
            {customer.address?.village ? (
              <View style={styles.villagePill}>
                <Text style={styles.villageText} numberOfLines={1}>
                  📍 {customer.address.village}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* 3D Clay Chevron Indicator */}
        <View style={styles.chevronPill}>
          <Text style={styles.chevronText}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 16,
    marginVertical: 6,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255,255,255,0.85)',
    borderRightColor: '#DFE8EF',
    borderBottomColor: '#CFDCE6',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
      default: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
    }),
  },
  cardPressed: {
    transform: [{ scale: 0.985 }, { translateY: 2 }],
    borderBottomWidth: 1.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#E0F0F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#BBD6E6',
    borderBottomColor: '#BBD6E6',
  },
  avatarIcon: {
    fontSize: 24,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  fullName: {
    fontSize: 16,
    fontWeight: '700',
    color: clayColors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  mobile: {
    fontSize: 13,
    color: clayColors.textSecondary,
    fontWeight: '600',
  },
  codePill: {
    marginLeft: 8,
    backgroundColor: '#E6EFF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  codeText: {
    fontSize: 11,
    fontWeight: '700',
    color: clayColors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoriesRow: {
    flexDirection: 'row',
    gap: 6,
  },
  villagePill: {
    backgroundColor: '#F3F6F8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  villageText: {
    fontSize: 11,
    color: clayColors.textMuted,
    fontWeight: '500',
    maxWidth: 110,
  },
  chevronPill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EDF3F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  chevronText: {
    fontSize: 18,
    color: clayColors.primaryLight,
    fontWeight: 'bold',
    marginTop: -2,
  },
});
