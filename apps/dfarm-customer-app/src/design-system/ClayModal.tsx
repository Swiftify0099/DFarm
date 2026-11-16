import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { DFARM_COLORS, DFARM_RADIUS, DFARM_SHADOWS, DFARM_TYPOGRAPHY } from './theme';

export interface ClayModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const ClayModal: React.FC<ClayModalProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  children,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.bottomSheet}>
              {/* Handle bar */}
              <View style={styles.handleBar} />

              <View style={styles.header}>
                <View style={styles.headerTextCol}>
                  <Text style={styles.title}>{title}</Text>
                  {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn}>
                  <Text style={styles.closeText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {children}
              </ScrollView>
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
    backgroundColor: 'rgba(33, 27, 24, 0.45)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: DFARM_COLORS.surfaceWhite,
    borderTopLeftRadius: DFARM_RADIUS.xl,
    borderTopRightRadius: DFARM_RADIUS.xl,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '82%',
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
    ...DFARM_SHADOWS.clayTabBar,
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: DFARM_RADIUS.pill,
    backgroundColor: '#DDD5CD',
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: DFARM_COLORS.border,
  },
  headerTextCol: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    ...DFARM_TYPOGRAPHY.h2,
    color: DFARM_COLORS.primaryText,
  },
  subtitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: DFARM_RADIUS.pill,
    backgroundColor: DFARM_COLORS.surfaceInset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 14,
    fontWeight: '700',
    color: DFARM_COLORS.secondaryText,
  },
  scrollContent: {
    paddingBottom: 20,
  },
});
