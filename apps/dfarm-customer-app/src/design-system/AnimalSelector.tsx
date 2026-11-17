import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_TYPOGRAPHY, DFARM_SHADOWS } from './theme';
import { CowIcon } from '../assets/vectors/CowIcon';
import { BuffaloIcon } from '../assets/vectors/BuffaloIcon';
import { HerdIcon } from '../assets/vectors/HerdIcon';

export type AnimalType = 'COW' | 'BUFFALO' | 'BOTH';

export interface AnimalSelectorProps {
  value: AnimalType;
  onChange: (value: AnimalType) => void;
}

export const AnimalSelector: React.FC<AnimalSelectorProps> = ({ value, onChange }) => {
  const options: { type: AnimalType; label: string; subLabel: string; renderIcon: (active: boolean) => React.ReactNode }[] = [
    {
      type: 'COW',
      label: 'Cow',
      subLabel: 'गाय',
      renderIcon: () => <CowIcon size={32} />,
    },
    {
      type: 'BUFFALO',
      label: 'Buffalo',
      subLabel: 'म्हैस',
      renderIcon: () => <BuffaloIcon size={32} />,
    },
    {
      type: 'BOTH',
      label: 'Both',
      subLabel: 'दोन्ही',
      renderIcon: () => <HerdIcon size={36} />,
    },
  ];

  return (
    <View style={styles.container}>
      {options.map((opt) => {
        const isSelected = value === opt.type;
        return (
          <Pressable
            key={opt.type}
            onPress={() => onChange(opt.type)}
            style={({ pressed }) => [
              styles.optionCard,
              isSelected && styles.optionCardSelected,
              pressed && styles.pressed,
            ]}
          >
            <View pointerEvents="none" style={styles.specular} />
            <View style={styles.iconContainer}>{opt.renderIcon(isSelected)}</View>
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
              {opt.label}
            </Text>
            <Text style={[styles.subLabel, isSelected && styles.subLabelSelected]}>
              {opt.subLabel}
            </Text>
            {isSelected && (
              <View style={styles.activeCheckPill}>
                <Text style={styles.checkText}>✓</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 6,
  },
  optionCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: DFARM_RADIUS.md,
    backgroundColor: DFARM_COLORS.surfaceWhite,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    position: 'relative',
    overflow: 'hidden',
    ...DFARM_SHADOWS.clayCard,
  },
  optionCardSelected: {
    borderColor: DFARM_COLORS.primaryOrange,
    backgroundColor: '#FFF9F5',
    ...DFARM_SHADOWS.clayCardActive,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  specular: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  iconContainer: {
    marginBottom: 6,
  },
  label: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  labelSelected: {
    color: DFARM_COLORS.primaryOrange,
  },
  subLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginTop: 1,
  },
  subLabelSelected: {
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '600',
  },
  activeCheckPill: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: DFARM_COLORS.primaryOrange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});
