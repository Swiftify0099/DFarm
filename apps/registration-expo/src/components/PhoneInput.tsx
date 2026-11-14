import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ReturnKeyTypeOptions,
} from 'react-native';
import { colors } from '../theme/colors';

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
        <View style={styles.prefixContainer}>
          <Text style={styles.phoneIcon}>📞</Text>
          <Text style={styles.prefixText}>+91</Text>
          <Text style={styles.divider}>|</Text>
        </View>
        <TextInput
          style={styles.input}
          value={rawDigits}
          onChangeText={handleTextChange}
          placeholder="9876543210"
          placeholderTextColor={colors.outline}
          keyboardType="phone-pad"
          maxLength={10}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      </View>
      {isError && errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onSurface,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  inputError: {
    borderColor: colors.error,
  },
  prefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
  },
  phoneIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  prefixText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onSurface,
    marginRight: 8,
  },
  divider: {
    fontSize: 16,
    color: colors.outlineVariant,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.onSurface,
    paddingVertical: 10,
    letterSpacing: 1,
  },
  errorText: {
    fontSize: 12,
    color: colors.error,
    marginTop: 4,
    marginLeft: 4,
  },
});
