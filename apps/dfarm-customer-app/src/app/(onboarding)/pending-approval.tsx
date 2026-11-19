import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayHeader,
  StatusTimeline,
} from '../../design-system';
import { useRegistration } from '../../features/registration/useRegistration';
import {
  StatusPendingIllustration,
  StatusApprovedIllustration,
  StatusRejectedIllustration,
} from '../../assets/vectors/StatusAssets';

export default function PendingApprovalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    dairyName?: string;
    farmerName?: string;
    customerId?: string;
  }>();

  const { status, isCheckingStatus, refetchStatus } = useRegistration();

  const isApproved = status?.status === 'APPROVED' || status?.registrationStatus === 'APPROVED';
  const isRejected = status?.status === 'REJECTED' || status?.registrationStatus === 'REJECTED';

  const dairyName =
    status?.assignedDairyName ||
    params.dairyName ||
    'DFarm Cooperative Society';
  const farmerName = status?.fullName || params.farmerName || 'Registered Farmer';
  const customerCode = status?.customerCode || status?.farmerCode || 'Pending Assignment';
  const rejectionReason = status?.rejectionReason || status?.reason;

  const applicationRef =
    status?.customerCode ||
    status?.farmerCode ||
    (params.customerId
      ? `DFARM-${params.customerId.slice(0, 8).toUpperCase()}`
      : 'DFARM-APPLICATION-ACTIVE');

  const handleManualCheck = async () => {
    const res = await refetchStatus();
    if (res.data?.status === 'APPROVED' || res.data?.registrationStatus === 'APPROVED') {
      router.replace('/(main)');
    }
  };

  const handleProceedToDashboard = () => {
    router.replace('/(main)');
  };

  const handleReapply = () => {
    router.replace('/(onboarding)/register');
  };

  const timelineSteps = isApproved
    ? [
        {
          title: 'Biometric Enrollment Completed',
          subtitle: 'OpenCV YuNet detection & SFace INT8 128-D vector saved',
          status: 'completed' as const,
        },
        {
          title: 'Dairy Society Review Approved',
          subtitle: `Verified by ${dairyName} administrative desk`,
          status: 'completed' as const,
        },
        {
          title: 'Milk Collection Card Activated',
          subtitle: 'Farmer code assigned and ready for daily milk intake',
          status: 'completed' as const,
        },
      ]
    : isRejected
    ? [
        {
          title: 'Biometric Enrollment Submitted',
          subtitle: 'OpenCV YuNet + SFace INT8 template captured',
          status: 'completed' as const,
        },
        {
          title: 'Society Review Not Approved',
          subtitle: rejectionReason || 'Application could not be approved at this time',
          status: 'current' as const,
        },
        {
          title: 'Account Inactive',
          subtitle: 'Please correct details and re-apply for registration',
          status: 'pending' as const,
        },
      ]
    : [
        {
          title: 'Biometric Enrollment Submitted',
          subtitle: '128-D vector encrypted and submitted with consent',
          status: 'completed' as const,
        },
        {
          title: 'Dairy Admin Verification in Progress',
          subtitle: `Currently being reviewed by ${dairyName}`,
          status: 'current' as const,
        },
        {
          title: 'Producer Account Activation',
          subtitle: 'Contactless milk pouring will be activated upon approval',
          status: 'pending' as const,
        },
      ];

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Registration Status"
        subtitle="नोंदणी स्थिती व पडताळणी"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isApproved ? (
          /* Approved State */
          <>
            <ClayCard variant="raised" style={styles.statusCard}>
              <View style={styles.illustrationWrapper}>
                <StatusApprovedIllustration size={76} />
              </View>

              <ClayBadge label="Registration Approved" variant="success" />

              <Text style={styles.heading}>Account Activated!</Text>
              <Text style={styles.description}>
                Your producer registration has been verified and approved by{' '}
                <Text style={styles.boldText}>{dairyName}</Text>. You can now begin delivering milk and track daily pour logs.
              </Text>

              <View style={styles.detailsBox}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Applicant Name</Text>
                  <Text style={styles.detailValue}>{farmerName}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Assigned Farmer Code</Text>
                  <Text
                    style={[
                      styles.detailValue,
                      { color: DFARM_COLORS.primaryOrange, fontWeight: '800' },
                    ]}
                  >
                    {customerCode}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Biometric Engine</Text>
                  <Text style={styles.detailValue}>YuNet + SFace Active</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Account Status</Text>
                  <Text style={[styles.detailValue, { color: '#2E7D32', fontWeight: '800' }]}>
                    ACTIVE
                  </Text>
                </View>
              </View>

              {/* Progress Timeline */}
              <StatusTimeline steps={timelineSteps} />
            </ClayCard>

            <View style={styles.actionSection}>
              <ClayButton
                title="Proceed to Dashboard"
                onPress={handleProceedToDashboard}
                variant="primary"
                style={styles.actionBtn}
              />
            </View>
          </>
        ) : isRejected ? (
          /* Rejected State */
          <>
            <ClayCard variant="raised" style={styles.statusCard}>
              <View style={styles.illustrationWrapper}>
                <StatusRejectedIllustration size={76} />
              </View>

              <ClayBadge label="Registration Rejected" variant="error" />

              <Text style={styles.heading}>Application Review Failed</Text>
              <Text style={styles.description}>
                Your registration was reviewed by{' '}
                <Text style={styles.boldText}>{dairyName}</Text> and could not be approved at this time.
              </Text>

              <View style={[styles.detailsBox, styles.rejectionBox]}>
                <Text style={styles.rejectionTitle}>Dairy Admin Review Note:</Text>
                <Text style={styles.rejectionText}>
                  "{rejectionReason || 'Identity uniqueness or village boundaries could not be verified by dairy administrator.'}"
                </Text>
              </View>

              {/* Progress Timeline */}
              <StatusTimeline steps={timelineSteps} />
            </ClayCard>

            <View style={styles.actionSection}>
              <ClayButton
                title="Edit & Re-submit Registration"
                onPress={handleReapply}
                variant="primary"
                style={styles.actionBtn}
              />
              <ClayButton
                title="Check Status Again"
                onPress={handleManualCheck}
                loading={isCheckingStatus}
                variant="outline"
                style={styles.actionBtn}
              />
            </View>
          </>
        ) : (
          /* Pending State */
          <>
            <ClayCard variant="raised" style={styles.statusCard}>
              <View style={styles.illustrationWrapper}>
                <StatusPendingIllustration size={76} />
              </View>

              <ClayBadge label="Under Dairy Admin Review" variant="pending" />

              <Text style={styles.heading}>Approval Pending</Text>
              <Text style={styles.description}>
                Your registration request has been submitted to{' '}
                <Text style={styles.boldText}>{dairyName}</Text>. The dairy administrator will verify
                your details and activate your milk collection account.
              </Text>

              <View style={styles.detailsBox}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Applicant Name</Text>
                  <Text style={styles.detailValue}>{farmerName}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Biometric Status</Text>
                  <Text style={styles.detailValue}>Enrolled (128-D Vector)</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Application Reference</Text>
                  <Text style={[styles.detailValue, styles.monoRef]}>{applicationRef}</Text>
                </View>
              </View>

              {/* Progress Timeline */}
              <StatusTimeline steps={timelineSteps} />
            </ClayCard>

            <View style={styles.actionSection}>
              <ClayButton
                title="Check Approval Status Now"
                onPress={handleManualCheck}
                loading={isCheckingStatus}
                variant="primary"
                style={styles.actionBtn}
              />
              <ClayButton
                title="View All My Dairy Accounts / सर्व खाती पहा"
                onPress={() => router.push('/(auth)/select-dairy')}
                variant="secondary"
                style={[styles.actionBtn, { marginTop: 10 }]}
              />
            </View>
          </>
        )}
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
    paddingHorizontal: 16,
    paddingVertical: 18,
    paddingBottom: 28,
  },
  statusCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 18,
    marginBottom: 16,
  },
  illustrationWrapper: {
    marginBottom: 14,
  },
  heading: {
    ...DFARM_TYPOGRAPHY.h1,
    color: DFARM_COLORS.primaryText,
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.secondaryText,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  boldText: {
    color: DFARM_COLORS.primaryText,
    fontWeight: '700',
  },
  detailsBox: {
    width: '100%',
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: DFARM_RADIUS.md,
    borderWidth: 1.5,
    borderColor: DFARM_COLORS.border,
    padding: 14,
    marginBottom: 14,
  },
  rejectionBox: {
    backgroundColor: '#FFF8F8',
    borderColor: '#FFCDD2',
  },
  rejectionTitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.error,
    marginBottom: 4,
  },
  rejectionText: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: DFARM_COLORS.primaryText,
    fontStyle: 'italic',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  detailLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  detailValue: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  monoRef: {
    color: DFARM_COLORS.primaryOrange,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: DFARM_COLORS.border,
    marginVertical: 6,
  },
  actionSection: {
    gap: 12,
  },
  actionBtn: {
    width: '100%',
  },
});
