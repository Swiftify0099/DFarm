import React, { useRef } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  Text,
} from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_SHADOWS } from './theme';

export interface ClayOTPInputProps {
  length?: number;
  value: string;
  onChange: (otp: string) => void;
  error?: boolean;
}

export const ClayOTPInput: React.FC<ClayOTPInputProps> = ({
  length = 6,
  value,
  onChange,
  error = false,
}) => {
  const inputRef = useRef<any>(null);

  const digits = value.split('');
  const boxArray = Array.from({ length }, (_, i) => i);

  const handleBoxPress = () => {
    inputRef.current?.focus();
  };

  const handleTextChange = (text: string) => {
    // Only allow numbers and max length
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, length);
    onChange(cleaned);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={handleBoxPress} style={styles.boxesRow}>
        {boxArray.map((index) => {
          const digit = digits[index] || '';
          const isCurrent = index === digits.length;
          const isFilled = !!digit;

          return (
            <View
              key={index}
              style={[
                styles.box,
                isFilled && styles.boxFilled,
                isCurrent && styles.boxCurrent,
                error && styles.boxError,
              ]}
            >
              <View pointerEvents="none" style={styles.specularHighlight} />
              <Text
                style={[
                  styles.digitText,
                  isFilled && styles.digitTextFilled,
                  error && styles.digitTextError,
                ]}
              >
                {digit}
              </Text>
            </View>
          );
        })}
      </Pressable>

      {/* Hidden real input for native keyboard & auto-fill */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleTextChange}
        keyboardType="number-pad"
        maxLength={length}
        textContentType="oneTimeCode"
        style={styles.hiddenInput}
        autoFocus
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 18,
    alignItems: 'center',
  },
  boxesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
  },
  box: {
    width: 48,
    height: 58,
    borderRadius: DFARM_RADIUS.md,
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  boxFilled: {
    backgroundColor: '#FFFFFF',
    borderColor: DFARM_COLORS.peach,
    ...DFARM_SHADOWS.clayCard,
  },
  boxCurrent: {
    borderColor: DFARM_COLORS.primaryOrange,
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  boxError: {
    borderColor: DFARM_COLORS.error,
    backgroundColor: '#FFF5F5',
  },
  digitText: {
    fontSize: 24,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  digitTextFilled: {
    color: DFARM_COLORS.primaryOrange,
  },
  digitTextError: {
    color: DFARM_COLORS.error,
  },
  specularHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
});
