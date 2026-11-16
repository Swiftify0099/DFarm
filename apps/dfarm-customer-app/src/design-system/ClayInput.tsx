import React, { useState, useRef, useImperativeHandle } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  StyleProp,
  Pressable,
} from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_TYPOGRAPHY } from './theme';

export interface ClayInputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export const ClayInput = React.forwardRef<any, ClayInputProps>(
  (
    {
      label,
      error,
      helperText,
      leftElement,
      rightElement,
      containerStyle,
      style,
      onFocus,
      onBlur,
      ...rest
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<any>(null);

    useImperativeHandle(ref, () => inputRef.current);

    const handlePressContainer = () => {
      inputRef.current?.focus();
    };

    return (
      <View style={[styles.wrapper, containerStyle]}>
        {label && <Text style={styles.label}>{label}</Text>}
        <Pressable
          onPress={handlePressContainer}
          style={[
            styles.inputContainer,
            isFocused && styles.inputFocused,
            !!error && styles.inputError,
          ]}
        >
          {leftElement && (
            <View style={styles.leftContainer} pointerEvents="none">
              {leftElement}
            </View>
          )}
          <TextInput
            ref={inputRef}
            placeholderTextColor={DFARM_COLORS.secondaryText}
            style={[styles.input, style]}
            onFocus={(e) => {
              setIsFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              onBlur?.(e);
            }}
            {...rest}
          />
          {rightElement && (
            <View style={styles.rightContainer}>{rightElement}</View>
          )}
        </Pressable>
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : helperText ? (
          <Text style={styles.helperText}>{helperText}</Text>
        ) : null}
      </View>
    );
  }
);

ClayInput.displayName = 'ClayInput';

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '600',
    color: DFARM_COLORS.primaryText,
    marginBottom: 6,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: DFARM_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputFocused: {
    borderColor: DFARM_COLORS.primaryOrange,
    borderWidth: 1.5,
  },
  inputError: {
    borderColor: DFARM_COLORS.error,
    backgroundColor: '#FFF8F8',
  },
  leftContainer: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightContainer: {
    marginLeft: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: DFARM_COLORS.primaryText,
    paddingVertical: 12,
    minHeight: 48,
  },
  errorText: {
    fontSize: 12,
    color: DFARM_COLORS.error,
    marginTop: 4,
    marginLeft: 4,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    color: DFARM_COLORS.secondaryText,
    marginTop: 4,
    marginLeft: 4,
  },
});
