import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';

interface ConfirmationDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  dismissText?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onDismiss: () => void;
  children?: React.ReactNode;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  visible,
  title,
  message,
  confirmText = 'Confirm',
  dismissText = 'Cancel',
  confirmColor = clayColors.primary,
  onConfirm,
  onDismiss,
  children,
}) => {
  const [confirmPressed, setConfirmPressed] = useState(false);
  const [cancelPressed, setCancelPressed] = useState(false);

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dialogCard}>
              {/* Header Icon / Title */}
              <View style={styles.headerRow}>
                <View style={styles.dialogIconBadge}>
                  <Text style={styles.dialogEmoji}>🛡️</Text>
                </View>
                <Text style={styles.title}>{title}</Text>
              </View>

              {message ? <Text style={styles.message}>{message}</Text> : null}

              {children}

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.button, styles.cancelButton, cancelPressed && styles.buttonPressed]}
                  onPress={onDismiss}
                  onPressIn={() => setCancelPressed(true)}
                  onPressOut={() => setCancelPressed(false)}
                >
                  <Text style={styles.cancelText}>{dismissText}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.88}
                  style={[
                    styles.button,
                    styles.confirmButton,
                    { backgroundColor: confirmColor },
                    confirmPressed && styles.buttonPressed,
                  ]}
                  onPress={onConfirm}
                  onPressIn={() => setConfirmPressed(true)}
                  onPressOut={() => setConfirmPressed(false)}
                >
                  <Text style={styles.confirmText}>{confirmText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 20, 32, 0.62)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.dialog,
    padding: 24,
    borderTopWidth: 2.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 4,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#D2DFE8',
    borderBottomColor: '#BFD0DC',
    ...Platform.select({
      ios: {
        shadowColor: '#002538',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.22,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
      default: {},
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  dialogIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EDF4F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  dialogEmoji: {
    fontSize: 18,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: clayColors.textPrimary,
    flex: 1,
  },
  message: {
    fontSize: 14,
    color: clayColors.textSecondary,
    lineHeight: 20,
    marginBottom: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: clayRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }, { translateY: 2 }],
  },
  cancelButton: {
    backgroundColor: '#EDF3F7',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#CDDCE6',
    borderBottomColor: '#BDCED8',
  },
  cancelText: {
    color: clayColors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmButton: {
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: 'rgba(255, 255, 255, 0.45)',
    borderLeftColor: 'rgba(255, 255, 255, 0.25)',
    borderRightColor: 'rgba(0, 0, 0, 0.15)',
    borderBottomColor: 'rgba(0, 0, 0, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  confirmText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
