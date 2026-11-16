import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_TYPOGRAPHY } from './theme';
import { ClayButton } from './ClayButton';
import { ClayCard } from './ClayCard';

export interface EmptyStateProps {
  title: string;
  description: string;
  actionTitle?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const ClayEmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionTitle,
  onAction,
  icon,
}) => {
  return (
    <ClayCard variant="inset" style={styles.cardContainer}>
      {icon && <View style={styles.iconWrapper}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionTitle && onAction && (
        <ClayButton
          title={actionTitle}
          onPress={onAction}
          variant="outline"
          size="md"
          style={styles.actionBtn}
        />
      )}
    </ClayCard>
  );
};

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ClayErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
}) => {
  return (
    <ClayCard variant="inset" style={[styles.cardContainer, styles.errorContainer]}>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMsg}>{message}</Text>
      {onRetry && (
        <ClayButton
          title="Try Again"
          onPress={onRetry}
          variant="secondary"
          size="md"
          style={styles.actionBtn}
        />
      )}
    </ClayCard>
  );
};

export interface LoadingStateProps {
  message?: string;
}

export const ClayLoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading data...',
}) => {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={DFARM_COLORS.primaryOrange} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
    marginVertical: 16,
  },
  errorContainer: {
    backgroundColor: '#FFF8F8',
    borderColor: '#FFCDD2',
  },
  iconWrapper: {
    marginBottom: 14,
    width: 60,
    height: 60,
    borderRadius: DFARM_RADIUS.pill,
    backgroundColor: DFARM_COLORS.peach,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
    marginBottom: 6,
    textAlign: 'center',
  },
  description: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  errorTitle: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.error,
    marginBottom: 6,
    textAlign: 'center',
  },
  errorMsg: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
    textAlign: 'center',
    marginBottom: 18,
  },
  actionBtn: {
    marginTop: 6,
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
    marginTop: 12,
  },
});
