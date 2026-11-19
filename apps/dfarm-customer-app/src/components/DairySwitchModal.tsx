import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  DFARM_SHADOWS,
  ClayButton,
  ClayBadge,
} from '../design-system';
import { useAuth } from '../features/auth/useAuth';
import { CustomerMembership } from '../types/auth';
import {
  DairyCenterIcon,
  LocationPinIcon,
} from '../assets/vectors/LocationAssets';

interface DairySwitchModalProps {
  visible: boolean;
  onClose: () => void;
}

export const DairySwitchModal: React.FC<DairySwitchModalProps> = ({
  visible,
  onClose,
}) => {
  const router = useRouter();
  const { session, memberships, switchDairy, isSwitchingDairy } = useAuth();
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSelect = async (membership: CustomerMembership) => {
    if (membership.membershipStatus !== 'APPROVED') {
      if (membership.membershipStatus === 'PENDING_APPROVAL') {
        onClose();
        router.push({
          pathname: '/(onboarding)/pending-approval',
          params: {
            dairyName: membership.dairyName,
            customerId: membership.tenantCustomerId || membership.id,
            farmerCode: membership.farmerCode || undefined,
          },
        });
        return;
      }
      return;
    }

    if (session?.dairyId === membership.organizationId) {
      onClose();
      return;
    }

    try {
      setErrorMsg(null);
      setSwitchingId(membership.organizationId);
      await switchDairy({ dairyId: membership.organizationId });
      onClose();
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to switch dairy.'
      );
    } finally {
      setSwitchingId(null);
    }
  };

  const handleAddNew = () => {
    onClose();
    router.push('/(onboarding)/dairy-discovery');
  };

  const handleViewAll = () => {
    onClose();
    router.push('/(auth)/select-dairy');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <View style={styles.sheetContainer}>
          <View style={styles.indicatorBar} />

          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Switch Dairy Account</Text>
              <Text style={styles.sheetSubtitle}>डेअरी बदला (डेटा स्वतंत्र राहील)</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>

          {errorMsg && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          <ScrollView style={styles.listScroll} showsVerticalScrollIndicator={false}>
            {memberships.map((m) => {
              const isCurrent = session?.dairyId === m.organizationId;
              const isApproved = m.membershipStatus === 'APPROVED';
              const isPending = m.membershipStatus === 'PENDING_APPROVAL';

              const badgeVariant = isApproved
                ? ('success' as const)
                : isPending
                ? ('orange' as const)
                : ('neutral' as const);

              return (
                <Pressable
                  key={m.id}
                  onPress={() => handleSelect(m)}
                  style={({ pressed }) => [
                    styles.itemCard,
                    isCurrent && styles.activeItemCard,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.itemIcon}>
                    <DairyCenterIcon size={20} />
                  </View>

                  <View style={styles.itemInfo}>
                    <View style={styles.itemNameRow}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {m.dairyName}
                      </Text>
                      {isCurrent && (
                        <View style={styles.activePill}>
                          <Text style={styles.activePillText}>ACTIVE</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.itemSubRow}>
                      <LocationPinIcon size={12} />
                      <Text style={styles.itemAddress} numberOfLines={1}>
                        {m.dairyAddress || m.centerName || 'Regional Center'}
                      </Text>
                      <Text style={styles.dotSeparator}>•</Text>
                      <Text style={styles.itemCode}>
                        {m.farmerCode || (isApproved ? 'C-100' : 'Pending')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.itemBadgeCol}>
                    <ClayBadge
                      label={isApproved ? 'Approved' : isPending ? 'Pending' : m.membershipStatus}
                      variant={badgeVariant}
                    />
                    {switchingId === m.organizationId && (
                      <ActivityIndicator
                        size="small"
                        color={DFARM_COLORS.primaryOrange}
                        style={{ marginTop: 4 }}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}

            <View style={styles.divider} />

            <ClayButton
              title="+ Register With Another Dairy"
              variant="secondary"
              onPress={handleAddNew}
            />

            <Pressable onPress={handleViewAll} style={styles.viewAllBtn}>
              <Text style={styles.viewAllText}>Manage All Accounts / सर्व खाती व्यवस्थापित करा</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  backdrop: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: DFARM_RADIUS.lg,
    borderTopRightRadius: DFARM_RADIUS.lg,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '80%',
    ...DFARM_SHADOWS.clayCard,
  },
  indicatorBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
  },
  sheetSubtitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: DFARM_COLORS.secondaryText,
    fontWeight: '700',
  },
  errorBox: {
    backgroundColor: '#FFEBEE',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  errorText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.error,
    textAlign: 'center',
  },
  listScroll: {
    marginBottom: 8,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAF7',
    borderRadius: DFARM_RADIUS.md,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  activeItemCard: {
    borderColor: DFARM_COLORS.primaryOrange,
    backgroundColor: '#FFF9F4',
    borderWidth: 1.5,
  },
  pressed: {
    opacity: 0.8,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFF0E3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  itemInfo: {
    flex: 1,
    marginRight: 8,
  },
  itemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemName: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.primaryText,
    fontWeight: '700',
    flex: 1,
  },
  activePill: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  activePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2E7D32',
  },
  itemSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  itemAddress: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontSize: 11,
    color: DFARM_COLORS.secondaryText,
    marginLeft: 3,
    maxWidth: 130,
  },
  dotSeparator: {
    marginHorizontal: 4,
    color: DFARM_COLORS.secondaryText,
    fontSize: 10,
  },
  itemCode: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontSize: 11,
    color: DFARM_COLORS.primaryText,
    fontWeight: '600',
  },
  itemBadgeCol: {
    alignItems: 'flex-end',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: 14,
  },
  viewAllBtn: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 6,
  },
  viewAllText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
  },
});
