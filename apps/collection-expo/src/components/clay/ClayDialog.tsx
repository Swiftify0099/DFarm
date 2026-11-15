import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  ViewStyle,
  Text,
  TouchableOpacity,
} from 'react-native';
import { colors } from '../../theme/colors';
import { clayBorderRadius, clayShadows } from '../../theme/clay';
import { typography } from '../../theme/typography';

export interface ClayDialogProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  contentStyle?: ViewStyle;
}

export const ClayDialog: React.FC<ClayDialogProps> = ({
  visible,
  onDismiss,
  children,
  title,
  subtitle,
  contentStyle,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.dialogContainer, contentStyle]}>
              {(title || subtitle) && (
                <View style={styles.header}>
                  <View style={{ flex: 1 }}>
                    {title && <Text style={typography.titleLarge}>{title}</Text>}
                    {subtitle && (
                      <Text style={[typography.bodyMedium, { color: colors.textSecondary, marginTop: 2 }]}>
                        {subtitle}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.closeBtn}
                    onPress={onDismiss}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.closeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              {children}
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
    backgroundColor: 'rgba(5, 8, 12, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogContainer: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: colors.claySurfaceCard,
    borderRadius: clayBorderRadius.dialog,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderBottomWidth: 3,
    borderRightWidth: 1.5,
    borderTopColor: colors.claySurfaceHighlight,
    borderLeftColor: colors.claySurfaceHighlightSoft,
    borderBottomColor: colors.claySurfaceShadow,
    borderRightColor: colors.claySurfaceShadowSubtle,
    padding: 24,
    ...clayShadows.raisedLg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  closeText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
