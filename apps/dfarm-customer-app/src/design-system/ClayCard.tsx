import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Pressable } from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_SHADOWS } from './theme';

export interface ClayCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: 'raised' | 'highlight' | 'inset' | 'orange';
  active?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

export const ClayCard: React.FC<ClayCardProps> = ({
  children,
  style,
  variant = 'raised',
  active = false,
  onPress,
  disabled = false,
}) => {
  const getVariantStyle = (): ViewStyle => {
    switch (variant) {
      case 'highlight':
        return styles.variantHighlight;
      case 'inset':
        return styles.variantInset;
      case 'orange':
        return styles.variantOrange;
      case 'raised':
      default:
        return styles.variantRaised;
    }
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.base,
          getVariantStyle(),
          active && styles.active,
          pressed && styles.pressed,
          style,
        ]}
      >
        <View pointerEvents="none" style={styles.specularHighlight} />
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[styles.base, getVariantStyle(), active && styles.active, style]}>
      <View pointerEvents="none" style={styles.specularHighlight} />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: DFARM_RADIUS.lg,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
  },
  variantRaised: {
    backgroundColor: DFARM_COLORS.surfaceWhite,
    ...DFARM_SHADOWS.clayCard,
  },
  variantHighlight: {
    backgroundColor: DFARM_COLORS.peach,
    borderColor: '#F7D6C1',
    ...DFARM_SHADOWS.clayCard,
  },
  variantInset: {
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderColor: DFARM_COLORS.border,
    elevation: 0,
    shadowOpacity: 0,
  },
  variantOrange: {
    backgroundColor: DFARM_COLORS.primaryOrange,
    borderColor: '#E65E00',
    ...DFARM_SHADOWS.clayButton,
  },
  active: {
    borderColor: DFARM_COLORS.primaryOrange,
    backgroundColor: '#FFF9F5',
    ...DFARM_SHADOWS.clayCardActive,
  },
  specularHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
