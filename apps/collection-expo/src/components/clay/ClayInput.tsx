import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  KeyboardTypeOptions,
} from 'react-native';
import { colors } from '../../theme/colors';
import { clayBorderRadius } from '../../theme/clay';

export interface ClayInputProps {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  numberOfLines?: number;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  editable?: boolean;
  error?: string | null;
  helperText?: string;
  unitLabel?: string;
  badge?: React.ReactNode;
}

export const ClayInput: React.FC<ClayInputProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  multiline = false,
  numberOfLines = 1,
  style,
  inputStyle,
  editable = true,
  error,
  helperText,
  unitLabel,
  badge,
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, style]}>
      {(label || badge) && (
        <View style={styles.headerRow}>
          {label && <Text style={styles.label}>{label}</Text>}
          {badge && <View>{badge}</View>}
        </View>
      )}

      <View
        style={[
          styles.inputContainer,
          isFocused && styles.inputFocused,
          error ? styles.inputError : undefined,
          !editable && styles.inputDisabled,
          multiline && { height: 26 * (numberOfLines || 3) + 20, alignItems: 'flex-start' },
        ]}
      >
        <TextInput
          style={[
            styles.input,
            multiline && { height: 26 * (numberOfLines || 3), textAlignVertical: 'top' },
            inputStyle,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          multiline={multiline}
          numberOfLines={numberOfLines}
          editable={editable}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />

        {unitLabel && (
          <View style={styles.unitContainer}>
            <Text style={styles.unitText}>{unitLabel}</Text>
          </View>
        )}
      </View>

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  inputContainer: {
    height: 52,
    backgroundColor: colors.clayInsetBg,
    borderRadius: clayBorderRadius.md,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderTopColor: colors.clayInsetBorderTop,
    borderLeftColor: colors.clayInsetBorderTop,
    borderBottomColor: colors.clayInsetBorderBottom,
    borderRightColor: colors.clayInsetBorderBottom,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  inputFocused: {
    borderTopColor: colors.clayGreenLight,
    borderLeftColor: colors.clayGreenLight,
    borderBottomColor: colors.clayGreenBorder,
    borderRightColor: colors.clayGreenBorder,
  },
  inputError: {
    borderTopColor: colors.clayRedBorder,
    borderLeftColor: colors.clayRedBorder,
    borderBottomColor: colors.clayRed,
    borderRightColor: colors.clayRed,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  unitContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  unitText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  errorText: {
    color: colors.statusError,
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  helperText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
