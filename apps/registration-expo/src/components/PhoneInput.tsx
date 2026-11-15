import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ReturnKeyTypeOptions,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';

interface PhoneInputProps {
  rawDigits: string;
  onValueChange: (digits: string) => void;
  label?: string;
  isError?: boolean;
  errorMessage?: string | null;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  rawDigits,
  onValueChange,
  label = 'Mobile Number',
  isError = false,
  errorMessage,
  returnKeyType = 'next',
  onSubmitEditing,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const handleTextChange = (text: string) => {
    // Only accept numeric digits, up to 10 characters
    const filtered = text.replace(/[^0-9]/g, '').slice(0, 10);
    onValueChange(filtered);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          isError && styles.inputError,
        ]}
      >
        <View style={styles.prefixPill}>
          <Text style={styles.phoneIcon}>📞</Text>
          <Text style={styles.prefixText}>+91</Text>
        </View>
        <View style={styles.divider} />
        <TextInput
          style={styles.input}
          value={rawDigits}
          onChangeText={handleTextChange}
          placeholder="9876543210"
          placeholderTextColor={clayColors.textMuted}
          keyboardType="phone-pad"
          maxLength={10}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {rawDigits.length === 10 ? (
          <View style={styles.checkPill}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        ) : null}
      </View>
      {isError && errorMessage ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: clayColors.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5EEF5',
    borderRadius: clayRadius.md,
    paddingHorizontal: 12,
    minHeight: 52,
    borderTopWidth: 2,
    borderLeftWidth: 1.5,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#C4D5E2',
    borderLeftColor: '#CAD9E5',
    borderRightColor: '#FFFFFF',
    borderBottomColor: '#FFFFFF',
  },
  inputFocused: {
    backgroundColor: '#EDF5FA',
    borderTopColor: clayColors.primary,
    borderLeftColor: clayColors.primary,
    borderRightColor: clayColors.primaryLight,
    borderBottomColor: clayColors.primaryLight,
    borderWidth: 1.5,
    ...Platform.select({
      ios: {
        shadowColor: clayColors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
      default: {},
    }),
  },
  inputError: {
    backgroundColor: '#FFF0F0',
    borderTopColor: clayColors.error,
    borderLeftColor: clayColors.error,
    borderRightColor: clayColors.errorLight,
    borderBottomColor: clayColors.errorLight,
  },
  prefixPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D9E6F0',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: clayRadius.sm,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 1.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#BDCFDE',
    borderBottomColor: '#BDCFDE',
  },
  phoneIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  prefixText: {
    fontSize: 14,
    fontWeight: '700',
    color: clayColors.primary,
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: '#CAD7E2',
    marginHorizontal: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: clayColors.textPrimary,
    fontWeight: '600',
    letterSpacing: 1,
    paddingVertical: 10,
  },
  checkPill: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: clayColors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.6)',
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    paddingHorizontal: 4,
  },
  errorIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  errorText: {
    fontSize: 12,
    color: clayColors.error,
    fontWeight: '600',
  },
});
