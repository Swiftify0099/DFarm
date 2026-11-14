import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const normalized = status ? status.toUpperCase() : '';

  let backgroundColor = colors.statusDefaultBg;
  let textColor = colors.statusDefaultText;

  switch (normalized) {
    case 'ACTIVE':
      backgroundColor = colors.statusActiveBg;
      textColor = colors.statusActiveText;
      break;
    case 'DRAFT':
      backgroundColor = colors.statusDraftBg;
      textColor = colors.statusDraftText;
      break;
    case 'IN_PROGRESS':
    case 'PENDING_FACE_ENROLLMENT':
    case 'PENDING_RFID_ASSIGNMENT':
      backgroundColor = colors.statusPendingBg;
      textColor = colors.statusPendingText;
      break;
    case 'SUSPENDED':
      backgroundColor = colors.statusSuspendedBg;
      textColor = colors.statusSuspendedText;
      break;
    default:
      backgroundColor = colors.statusDefaultBg;
      textColor = colors.statusDefaultText;
      break;
  }

  let displayLabel = status;
  if (normalized === 'PENDING_FACE_ENROLLMENT') displayLabel = 'Pending Face';
  else if (normalized === 'PENDING_RFID_ASSIGNMENT') displayLabel = 'Pending RFID';
  else if (normalized === 'IN_PROGRESS') displayLabel = 'In Progress';

  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{displayLabel}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
