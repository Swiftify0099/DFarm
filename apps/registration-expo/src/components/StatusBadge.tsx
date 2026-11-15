import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const normalized = status ? status.toUpperCase() : '';

  let backgroundColor = '#F0F4F7';
  let textColor = '#5A6975';
  let borderColor = '#D8E2E9';

  switch (normalized) {
    case 'ACTIVE':
      backgroundColor = '#E4F6EB';
      textColor = '#137333';
      borderColor = '#BAE6C7';
      break;
    case 'DRAFT':
      backgroundColor = '#FEF6E4';
      textColor = '#B06000';
      borderColor = '#FCE0A6';
      break;
    case 'IN_PROGRESS':
    case 'PENDING_FACE_ENROLLMENT':
    case 'PENDING_RFID_ASSIGNMENT':
      backgroundColor = '#E5F1FC';
      textColor = '#1064CA';
      borderColor = '#B7D8F8';
      break;
    case 'SUSPENDED':
    case 'SOFT_DELETED':
    case 'INACTIVE':
      backgroundColor = '#FDEAEA';
      textColor = '#BA1A1A';
      borderColor = '#FAC1C1';
      break;
    default:
      backgroundColor = '#F0F4F7';
      textColor = '#5A6975';
      borderColor = '#D8E2E9';
      break;
  }

  let displayLabel = status;
  if (normalized === 'PENDING_FACE_ENROLLMENT') displayLabel = 'Pending Face';
  else if (normalized === 'PENDING_RFID_ASSIGNMENT') displayLabel = 'Pending RFID';
  else if (normalized === 'IN_PROGRESS') displayLabel = 'In Progress';
  else if (normalized === 'SOFT_DELETED') displayLabel = 'Deactivated';

  return (
    <View style={[styles.badge, { backgroundColor, borderColor }]}>
      <View style={[styles.statusDot, { backgroundColor: textColor }]} />
      <Text style={[styles.text, { color: textColor }]}>{displayLabel}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: clayRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255,255,255,0.7)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
