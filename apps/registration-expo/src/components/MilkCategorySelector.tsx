import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';

export type MilkCategoryOptionKey = 'COW' | 'BUFFALO' | 'BOTH';

export interface MilkCategoryOption {
  key: MilkCategoryOptionKey;
  label: string;
  categories: string[];
  description: string;
  icon: string;
  accentColor: string;
  selectedBg: string;
}

export const MILK_CATEGORY_OPTIONS: MilkCategoryOption[] = [
  {
    key: 'COW',
    label: 'Cow Milk Only',
    categories: ['COW'],
    description: 'Farmer supplies Cow milk exclusively',
    icon: '🐄',
    accentColor: '#E65100',
    selectedBg: '#FFF3E8',
  },
  {
    key: 'BUFFALO',
    label: 'Buffalo Milk Only',
    categories: ['BUFFALO'],
    description: 'Farmer supplies Buffalo milk exclusively',
    icon: '🐃',
    accentColor: '#37474F',
    selectedBg: '#EDF1F3',
  },
  {
    key: 'BOTH',
    label: 'Both (Cow & Buffalo)',
    categories: ['COW', 'BUFFALO'],
    description: 'Farmer supplies both Cow and Buffalo milk deliveries',
    icon: '🥛',
    accentColor: '#00506E',
    selectedBg: '#E4F2F8',
  },
];

interface MilkCategorySelectorProps {
  selectedOption: MilkCategoryOptionKey;
  onOptionSelected: (option: MilkCategoryOptionKey) => void;
}

export const MilkCategorySelector: React.FC<MilkCategorySelectorProps> = ({
  selectedOption,
  onOptionSelected,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Permitted Milk Delivery Category *</Text>
      <Text style={styles.subtitle}>
        Select the milk types this farmer is authorized to deliver at the center:
      </Text>

      <View style={styles.optionsList}>
        {MILK_CATEGORY_OPTIONS.map((option) => {
          const isSelected = selectedOption === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              activeOpacity={0.85}
              style={[
                styles.optionCard,
                isSelected ? [styles.cardSelected, { backgroundColor: option.selectedBg, borderColor: option.accentColor }] : styles.cardUnselected,
              ]}
              onPress={() => onOptionSelected(option.key)}
            >
              {/* Category 3D Icon */}
              <View
                style={[
                  styles.iconContainer,
                  isSelected && { backgroundColor: '#FFFFFF' },
                ]}
              >
                <Text style={styles.categoryEmoji}>{option.icon}</Text>
              </View>

              <View style={styles.textContainer}>
                <Text
                  style={[
                    styles.optionLabel,
                    isSelected && { color: option.accentColor },
                  ]}
                >
                  {option.label}
                </Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>

              {/* 3D Radio / Checkmark Badge */}
              <View
                style={[
                  styles.checkBadge,
                  isSelected
                    ? [styles.checkBadgeSelected, { backgroundColor: option.accentColor }]
                    : styles.checkBadgeUnselected,
                ]}
              >
                {isSelected ? <Text style={styles.checkText}>✓</Text> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: clayColors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: clayColors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  optionsList: {
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: clayRadius.card,
    padding: 16,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  cardUnselected: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255,255,255,0.8)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
  },
  cardSelected: {
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255,255,255,0.9)',
    borderRightColor: 'rgba(0,0,0,0.1)',
    borderBottomColor: 'rgba(0,0,0,0.2)',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#EDF3F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  categoryEmoji: {
    fontSize: 22,
  },
  textContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: clayColors.textPrimary,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 12,
    color: clayColors.textMuted,
    lineHeight: 16,
  },
  checkBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  checkBadgeUnselected: {
    borderWidth: 2,
    borderColor: '#C0D0DC',
    backgroundColor: '#EDF4F8',
  },
  checkBadgeSelected: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.8)',
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
