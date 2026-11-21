import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  DFARM_SHADOWS,
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayHeader,
  ClayEmptyState,
} from '../../design-system';
import { useAuth } from '../../features/auth/useAuth';
import { CustomerMembership } from '../../types/auth';
import {
  DairyCenterIcon,
  LocationPinIcon,
} from '../../assets/vectors/LocationAssets';

export default function SelectDairyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mobileNumber?: string }>();
  const {
    session,
    memberships,
    isLoadingMemberships,
    refetchMemberships,
    switchDairy,
    isSwitchingDairy,
    logout,
  } = useAuth();

  const [selectingDairyId, setSelectingDairyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const phoneDisplay = params.mobileNumber || '';
  const maskedPhone =
    phoneDisplay.length === 10
      ? `+91 ${phoneDisplay.slice(0, 2)}*** ***${phoneDisplay.slice(8)}`
      : phoneDisplay;

  const handleSelectDairy = async (membership: CustomerMembership) => {
    if (membership.membershipStatus !== 'APPROVED') {
      if (membership.membershipStatus === 'PENDING_APPROVAL') {
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
      setErrorMessage(`Cannot switch: Account status is ${membership.membershipStatus}.`);
      return;
    }

    try {
      setErrorMessage(null);
      setSelectingDairyId(membership.organizationId);
      await switchDairy({ dairyId: membership.organizationId });
      router.replace('/(main)');
    } catch (err: any) {
      setErrorMessage(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to switch dairy. Please try again.'
      );
    } finally {
      setSelectingDairyId(null);
    }
  };

  const handleAddNewDairy = () => {
    router.push({
      pathname: '/(onboarding)/dairy-discovery',
      params: { mobileNumber: phoneDisplay },
    });
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Your Dairy Accounts"
        subtitle="तुमची डेअरी खाती"
        onBack={session?.dairyId ? () => router.replace('/(main)') : undefined}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Verified Mobile Identity Pill */}
        <View style={styles.identityBar}>
          <View style={styles.identityInfo}>
            <Text style={styles.identityLabel}>Verified Mobile / सत्यापित मोबाइल</Text>
            <Text style={styles.identityValue}>{maskedPhone || 'Producer Account'}</Text>
          </View>
          <ClayBadge label="OTP Verified" variant="success" />
        </View>

        {errorMessage && (
          <ClayCard variant="inset" style={styles.errorCard}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </ClayCard>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Connected Dairies ({memberships.length})
          </Text>
          <Text style={styles.sectionSubtitle}>
            Select a dairy to view passbook, milk records, and ledger
          </Text>
        </View>

        {isLoadingMemberships ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={DFARM_COLORS.primaryOrange} />
            <Text style={styles.loadingText}>Loading your dairy memberships...</Text>
          </View>
        ) : memberships.length === 0 ? (
          <ClayEmptyState
            title="No Dairies Connected"
            description="तुम्ही अद्याप कोणत्याही डेअरीशी जोडलेले नाही. नवीन डेअरी शोधा."
            actionTitle="Discover Nearby Dairies"
            onAction={handleAddNewDairy}
          />
        ) : (
          memberships.map((membership) => {
            const isCurrentActive = session?.dairyId === membership.organizationId;
            const isApproved = membership.membershipStatus === 'APPROVED';
            const isPending = membership.membershipStatus === 'PENDING_APPROVAL';
            const isRejected = membership.membershipStatus === 'REJECTED';

            const badgeVariant = isApproved
              ? ('success' as const)
              : isPending
              ? ('orange' as const)
              : isRejected
              ? ('error' as const)
              : ('neutral' as const);

            const statusLabel = isApproved
              ? 'Approved / मंजूर'
              : isPending
              ? 'Pending Review / पडताळणी सुरू'
              : isRejected
              ? 'Rejected / नामंजूर'
              : 'Suspended / निलंबित';

            const isSelectingThis = selectingDairyId === membership.organizationId;

            return (
              <ClayCard
                key={membership.id}
                variant={isCurrentActive ? 'highlight' : 'raised'}
                style={styles.membershipCard}
              >
                <View style={styles.cardHeaderRow}>
                  <View style={styles.dairyIconWrapper}>
                    <DairyCenterIcon size={24} />
                  </View>
                  <View style={styles.dairyTitleColumn}>
                    <Text style={styles.dairyNameText} numberOfLines={1}>
                      {membership.dairyName}
                    </Text>
                    <View style={styles.locationRow}>
                      <LocationPinIcon size={14} />
                      <Text style={styles.locationText} numberOfLines={1}>
                        {membership.dairyAddress || membership.centerName || 'Regional Dairy Center'}
                      </Text>
                    </View>
                  </View>
                  <ClayBadge label={statusLabel} variant={badgeVariant} />
                </View>

                {/* Account Details Row */}
                <View style={styles.metaRow}>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>FARMER CODE</Text>
                    <Text style={styles.metaValue}>
                      {membership.farmerCode || (isApproved ? 'C-100' : 'Awaiting Approval')}
                    </Text>
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>CENTER</Text>
                    <Text style={styles.metaValue} numberOfLines={1}>
                      {membership.centerName || 'Main Collection Center'}
                    </Text>
                  </View>
                  {isCurrentActive && (
                    <View style={styles.activeTag}>
                      <Text style={styles.activeTagText}>CURRENT</Text>
                    </View>
                  )}
                </View>

                {/* Card Action */}
                <View style={styles.cardActionRow}>
                  {isApproved ? (
                    <ClayButton
                      title={
                        isSelectingThis
                          ? 'Switching...'
                          : isCurrentActive
                          ? 'Active Dashboard / डॅशबोर्ड उघडा'
                          : 'Select Dairy / ही डेअरी निवडा'
                      }
                      variant={isCurrentActive ? 'primary' : 'secondary'}
                      disabled={isSwitchingDairy}
                      onPress={() => handleSelectDairy(membership)}
                    />
                  ) : isPending ? (
                    <ClayButton
                      title="View Application Status / स्थिती पहा"
                      variant="secondary"
                      onPress={() => handleSelectDairy(membership)}
                    />
                  ) : (
                    <Text style={styles.nonSelectableText}>
                      Contact Dairy Administrator for reactivation.
                    </Text>
                  )}
                </View>
              </ClayCard>
            );
          })
        )}

        {/* Add Another Dairy Action Card */}
        <ClayCard variant="inset" style={styles.addDairyCard}>
          <Text style={styles.addDairyTitle}>
            Want to deliver to another Dairy?
          </Text>
          <Text style={styles.addDairySubtitle}>
            तुम्ही एकाच फोन नंबरने दुसऱ्या डेअरीतही नोंदणी करू शकता. जुने खाते सुरक्षित राहील.
          </Text>
          <ClayButton
            title="+ Register With Another Dairy / नवीन डेअरी जोडा"
            variant="secondary"
            onPress={handleAddNewDairy}
          />
        </ClayCard>

        {/* Logout / Switch User */}
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Log Out / बाहेर पडा</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  identityBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: DFARM_RADIUS.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
    ...DFARM_SHADOWS.clayCard,
  },
  identityInfo: {
    flex: 1,
  },
  identityLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  identityValue: {
    ...DFARM_TYPOGRAPHY.bodyLg,
    color: DFARM_COLORS.primaryText,
    marginTop: 2,
    fontWeight: '700',
  },
  errorCard: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F98080',
    borderWidth: 1,
    marginBottom: 16,
    padding: 12,
  },
  errorText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.error,
    textAlign: 'center',
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    ...DFARM_TYPOGRAPHY.h2,
    color: DFARM_COLORS.primaryText,
  },
  sectionSubtitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginTop: 4,
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
    marginTop: 12,
  },
  membershipCard: {
    marginBottom: 16,
    padding: 18,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dairyIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF4EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dairyTitleColumn: {
    flex: 1,
    marginRight: 8,
  },
  dairyNameText: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  locationText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    marginLeft: 4,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAF7',
    borderRadius: DFARM_RADIUS.sm,
    padding: 12,
    marginTop: 14,
    marginBottom: 14,
  },
  metaCol: {
    flex: 1,
  },
  metaLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  metaValue: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.primaryText,
    marginTop: 2,
    fontWeight: '700',
  },
  activeTag: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activeTagText: {
    color: '#2E7D32',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardActionRow: {
    marginTop: 4,
  },
  nonSelectableText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 8,
  },
  addDairyCard: {
    marginTop: 12,
    marginBottom: 24,
    padding: 20,
    alignItems: 'center',
  },
  addDairyTitle: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
    textAlign: 'center',
  },
  addDairySubtitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  logoutButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  logoutText: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.error,
    fontWeight: '600',
  },
});
