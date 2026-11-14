import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export type MilkCategoryOptionKey = 'COW' | 'BUFFALO' | 'BOTH';

export interface MilkCategoryOption {
  key: MilkCategoryOptionKey;
  label: string;
  categories: string[];
  description: string;
}

export const MILK_CATEGORY_OPTIONS: MilkCategoryOption[] = [
  {
    key: 'COW',
    label: 'Cow Only',
    categories: ['COW'],
    description: 'Farmer supplies Cow milk exclusively',
  },
  {
    key: 'BUFFALO',
    label: 'Buffalo Only',
    categories: ['BUFFALO'],
    description: 'Farmer supplies Buffalo milk exclusively',
  },
  {
    key: 'BOTH',
    label: 'Both (Cow & Buffalo)',
    categories: ['COW', 'BUFFALO'],
    description: 'Farmer supplies both Cow and Buffalo milk',
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
      <Text style={styles.title}>Permitted Milk Category *</Text>
      <View style={styles.optionsList}>
        {MILK_CATEGORY_OPTIONS.map((option) => {
          const isSelected = selectedOption === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              activeOpacity={0.7}
              style={[
                styles.optionCard,
                isSelected ? styles.cardSelected : styles.cardUnselected,
              ]}
              onPress={() => onOptionSelected(option.key)}
            >
              <View
                style={[
                  styles.checkBadge,
                  isSelected ? styles.checkBadgeSelected : styles.checkBadgeUnselected,
                ]}
              >
                {isSelected ? <Text style={styles.checkText}>✓</Text> : null}
              </View>

              <View style={styles.textContainer}>
                <Text
                  style={[
                    styles.optionLabel,
                    isSelected ? styles.labelSelected : styles.labelUnselected,
                  ]}
                >
                  {option.label}
                </Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
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
    fontWeight: '600',
    color: colors.onSurface,
    marginBottom: 12,
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(35, 117, 155, 0.12)',
  },
  cardUnselected: {
    borderColor: colors.outlineVariant,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  checkBadgeSelected: {
    backgroundColor: colors.primary,
  },
  checkBadgeUnselected: {
    backgroundColor: colors.surfaceVariant,
  },
  checkText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  textContainer: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    color: colors.onSurface,
  },
  labelSelected: {
    fontWeight: '700',
  },
  labelUnselected: {
    fontWeight: '500',
  },
  optionDescription: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
});
