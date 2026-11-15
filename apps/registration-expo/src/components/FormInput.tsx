import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardTypeOptions,
  ReturnKeyTypeOptions,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';

interface FormInputProps {
  value: string;
  onValueChange: (text: string) => void;
  label: string;
  placeholder?: string;
  leadingIcon?: string;
  isError?: boolean;
  errorMessage?: string | null;
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  secureTextEntry?: boolean;
  editable?: boolean;
  multiline?: boolean;
}

export const FormInput: React.FC<FormInputProps> = ({
  value,
  onValueChange,
  label,
  placeholder,
  leadingIcon,
  isError = false,
  errorMessage,
  keyboardType = 'default',
  returnKeyType = 'next',
  onSubmitEditing,
  secureTextEntry = false,
  editable = true,
  multiline = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          isError && styles.inputError,
          !editable && styles.inputDisabled,
          multiline && styles.multilineContainer,
        ]}
      >
        {leadingIcon ? <Text style={styles.leadingIcon}>{leadingIcon}</Text> : null}
        <TextInput
          style={[styles.input, multiline && styles.multilineInput]}
          value={value}
          onChangeText={onValueChange}
          placeholder={placeholder}
          placeholderTextColor={clayColors.textMuted}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          secureTextEntry={secureTextEntry}
          editable={editable}
          multiline={multiline}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
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
    paddingHorizontal: 14,
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
  multilineContainer: {
    minHeight: 80,
    alignItems: 'flex-start',
    paddingVertical: 10,
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
  inputDisabled: {
    backgroundColor: '#ECEFF2',
    opacity: 0.65,
  },
  leadingIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: clayColors.textPrimary,
    fontWeight: '500',
    paddingVertical: 10,
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: 'top',
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
