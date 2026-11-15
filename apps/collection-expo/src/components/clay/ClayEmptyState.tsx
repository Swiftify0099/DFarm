import React from 'react';
import { View, Text, StyleSheet, Image, ViewStyle, ImageSourcePropType } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { ClayButton } from './ClayButton';
import { ClayCard } from './ClayCard';

export interface ClayEmptyStateProps {
  title: string;
  description: string;
  imageSource?: ImageSourcePropType;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export const ClayEmptyState: React.FC<ClayEmptyStateProps> = ({
  title,
  description,
  imageSource,
  icon = '📋',
  actionLabel,
  onAction,
  style,
}) => {
  return (
    <ClayCard variant="subtle" style={[styles.card, style]}>
      {imageSource ? (
        <Image source={imageSource} style={styles.image} resizeMode="contain" />
      ) : (
        <Text style={styles.icon}>{icon}</Text>
      )}

      <Text style={[typography.titleLarge, styles.title]}>{title}</Text>
      <Text style={[typography.bodyMedium, styles.description]}>{description}</Text>

      {actionLabel && onAction && (
        <View style={styles.actionContainer}>
          <ClayButton title={actionLabel} onPress={onAction} variant="secondary" size="sm" />
        </View>
      )}
    </ClayCard>
  );
};

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginVertical: 16,
  },
  image: {
    width: 140,
    height: 140,
    marginBottom: 16,
  },
  icon: {
    fontSize: 48,
    marginBottom: 12,
  },
  title: {
    textAlign: 'center',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  description: {
    textAlign: 'center',
    color: colors.textSecondary,
    maxWidth: 320,
    lineHeight: 20,
  },
  actionContainer: {
    marginTop: 18,
  },
});
