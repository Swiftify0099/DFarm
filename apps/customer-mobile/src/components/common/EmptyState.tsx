import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  message?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  message,
  icon,
  action,
  actionLabel,
  onAction,
}) => {
  const displayDesc = description || message;

  return (
    <View style={styles.container}>
      {icon && (
        <View style={styles.iconContainer}>
          {typeof icon === 'string' ? <Text style={styles.iconEmoji}>{icon}</Text> : icon}
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {displayDesc && <Text style={styles.description}>{displayDesc}</Text>}
      {action ? (
        <View style={styles.actionContainer}>{action}</View>
      ) : actionLabel && onAction ? (
        <View style={styles.actionContainer}>
          <Button title={actionLabel} variant="secondary" size="sm" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconEmoji: {
    fontSize: 48,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  actionContainer: {
    marginTop: 16,
  },
});
