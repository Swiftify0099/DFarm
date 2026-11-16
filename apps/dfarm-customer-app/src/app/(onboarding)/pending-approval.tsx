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
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayHeader,
} from '../../design-system';
import { useRegistration } from '../../features/registration/useRegistration';

export default function PendingApprovalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    dairyName?: string;
    farmerName?: string;
  }>();

  const { status, isCheckingStatus, refetchStatus } = useRegistration();

  const isApproved = status?.status === 'APPROVED' || status?.registrationStatus === 'APPROVED';
  const isRejected = status?.status === 'REJECTED' || status?.registrationStatus === 'REJECTED';

  const dairyName =
    status?.assignedDairyName ||
    params.dairyName ||
    'Shree Krishna Sahakari Dudh Sanstha';
  const farmerName = status?.fullName || params.farmerName || 'Registered Farmer';
  const customerCode = status?.customerCode || status?.farmerCode || 'Pending';
  const rejectionReason = status?.rejectionReason || status?.reason;

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

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader title="Registration Status" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {isApproved ? (
          /* Approved State */
          <>
            <ClayCard variant="raised" style={styles.statusCard}>
              <View style={[styles.iconCircle, { backgroundColor: '#E8F5E9' }]}>
                <Text style={styles.iconClock}>✅</Text>
              </View>

              <ClayBadge label="Registration Approved" variant="success" />

              <Text style={styles.heading}>Account Activated!</Text>
              <Text style={styles.description}>
                Your registration has been approved by{' '}
                <Text style={styles.boldText}>{dairyName}</Text>. You can now begin milk delivery and track daily pour logs.
              </Text>

              <View style={styles.detailsBox}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Applicant Name</Text>
                  <Text style={styles.detailValue}>{farmerName}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Assigned Farmer Code</Text>
                  <Text style={[styles.detailValue, { color: DFARM_COLORS.primaryOrange, fontWeight: '800' }]}>
                    {customerCode}
                  </Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Biometric Status</Text>
                  <Text style={styles.detailValue}>🟢 YuNet + SFace Active</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Account Status</Text>
                  <Text style={[styles.detailValue, { color: '#2E7D32', fontWeight: '800' }]}>ACTIVE</Text>
                </View>
              </View>
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
              <View style={[styles.iconCircle, { backgroundColor: '#FFEBEE' }]}>
                <Text style={styles.iconClock}>❌</Text>
              </View>

              <ClayBadge label="Registration Rejected" variant="error" />

              <Text style={styles.heading}>Application Rejected</Text>
              <Text style={styles.description}>
                Your registration request was reviewed by{' '}
                <Text style={styles.boldText}>{dairyName}</Text> and could not be approved at this time.
              </Text>

              <View style={[styles.detailsBox, styles.rejectionBox]}>
                <Text style={styles.rejectionTitle}>Admin Rejection Reason:</Text>
                <Text style={styles.rejectionText}>
                  "{rejectionReason || 'Identity uniqueness or village boundaries could not be verified by Dairy Admin.'}"
                </Text>
              </View>
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
              <View style={styles.iconCircle}>
                <Text style={styles.iconClock}>⏳</Text>
              </View>

              <ClayBadge label="Under Dairy Admin Review" variant="pending" />

              <Text style={styles.heading}>Approval Pending</Text>
              <Text style={styles.description}>
                Your registration request has been submitted to{' '}
                <Text style={styles.boldText}>{dairyName}</Text>. In accordance with administrative policy, the dairy
                administrator will verify your records and activate your milk collection account.
              </Text>

              <View style={styles.detailsBox}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Applicant Name</Text>
                  <Text style={styles.detailValue}>{farmerName}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Biometric Status</Text>
                  <Text style={styles.detailValue}>🟢 YuNet + SFace Verified</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Application Reference</Text>
                  <Text style={styles.detailValue}>DFT-2026-8891</Text>
                </View>
              </View>
            </ClayCard>

            <View style={styles.actionSection}>
              <ClayButton
                title="Check Approval Status Now"
                onPress={handleManualCheck}
                loading={isCheckingStatus}
                variant="primary"
                style={styles.actionBtn}
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
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  statusCard: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 18,
    marginBottom: 20,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: DFARM_COLORS.peach,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconClock: {
    fontSize: 34,
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
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  boldText: {
    color: DFARM_COLORS.primaryText,
    fontWeight: '700',
  },
  detailsBox: {
    width: '100%',
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
  },
  rejectionBox: {
    backgroundColor: '#FFF0F0',
    borderColor: '#FFCDD2',
    marginTop: 8,
  },
  rejectionTitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: '#C62828',
    marginBottom: 4,
  },
  rejectionText: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    color: '#B71C1C',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  divider: {
    height: 1,
    backgroundColor: DFARM_COLORS.border,
    marginVertical: 4,
  },
  detailLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
  detailValue: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  actionSection: {
    marginTop: 8,
  },
  actionBtn: {
    marginBottom: 12,
  },
});
