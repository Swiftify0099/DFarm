import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { customerApi } from '../api/customerApi';
import { CustomerDto } from '../types/models';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';
import { StatusBadge } from '../components/StatusBadge';
import { MilkCategoryBadge } from '../components/MilkCategoryBadge';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { ErrorView } from '../components/ErrorView';
import { ConfirmationDialog } from '../components/ConfirmationDialog';
import { PrimaryButton } from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerDetail'>;

export const CustomerDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { customerId } = route.params;

  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Dialogs
  const [showDeactivateDialog, setShowDeactivateDialog] = useState<boolean>(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState<boolean>(false);
  const [actionReason, setActionReason] = useState<string>('');

  const loadCustomer = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await customerApi.getCustomer(customerId);
      setCustomer(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load customer details');
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadCustomer();
  }, [loadCustomer]);

  const handleDeactivate = async () => {
    if (actionReason.trim().length < 5) return;
    setIsLoading(true);
    try {
      const updated = await customerApi.deleteCustomer(customerId, actionReason.trim());
      setCustomer(updated);
      setShowDeactivateDialog(false);
      setActionReason('');
      setActionSuccessMessage('Customer successfully deactivated.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to deactivate customer');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async () => {
    if (actionReason.trim().length < 5) return;
    setIsLoading(true);
    try {
      const updated = await customerApi.restoreCustomer(customerId, actionReason.trim());
      setCustomer(updated);
      setShowRestoreDialog(false);
      setActionReason('');
      setActionSuccessMessage('Customer successfully restored.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to restore customer');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !customer) {
    return <LoadingIndicator message="Loading farmer profile..." />;
  }

  if (errorMessage && !customer) {
    return <ErrorView message={errorMessage} onRetry={loadCustomer} />;
  }

  if (!customer) {
    return null;
  }

  const isSoftDeleted =
    customer.status === 'SOFT_DELETED' || customer.status === 'INACTIVE';

  const maskedAccount = customer.bankAccountNumber
    ? `•••• •••• ${customer.bankAccountNumber.slice(-4)}`
    : '—';

  return (
    <SafeAreaView style={styles.container}>
      {/* 3D Clay Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.8}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>

        <Text style={styles.topBarTitle}>Farmer Profile</Text>

        <TouchableOpacity
          style={styles.editButton}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('CustomerEdit', { customerId })}
        >
          <Text style={styles.editIcon}>✏️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Hero Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View style={styles.avatarPill}>
              <Text style={styles.avatarText}>🧑‍🌾</Text>
            </View>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.fullName}>{customer.fullName}</Text>
              {customer.farmerCode ? (
                <View style={styles.codePill}>
                  <Text style={styles.farmerCode}>
                    Code: {customer.farmerCode}
                  </Text>
                </View>
              ) : null}
            </View>
            <StatusBadge status={customer.status} />
          </View>

          <View style={styles.divider} />

          <View style={styles.uuidWrap}>
            <Text style={styles.uuidLabel}>Server Canonical Customer UUID:</Text>
            <Text style={styles.uuidValue}>{customer.id}</Text>
          </View>
        </View>

        {/* Contact & Identity Card */}
        <DetailSectionCard title="Contact & Primary Identity" icon="📞">
          <DetailRow label="Mobile (E.164)" value={customer.normalizedMobileNumber} />
          <DetailRow label="Primary Center ID" value={customer.primaryCenterId} />
          <DetailRow label="Registration Status" value={customer.registrationStatus} />
        </DetailSectionCard>

        {/* Geographic Address Card */}
        <DetailSectionCard title="Geographic Address & Location" icon="📍">
          <DetailRow label="Village" value={customer.address?.village || '—'} />
          <DetailRow
            label="Taluka / Subdistrict"
            value={customer.address?.talukaSubdistrict || '—'}
          />
          <DetailRow label="District" value={customer.address?.district || '—'} />
          <DetailRow
            label="State"
            value={customer.address?.state || 'Maharashtra'}
          />
          <DetailRow
            label="Postal PIN Code"
            value={customer.address?.postalCode || '—'}
          />
        </DetailSectionCard>

        {/* Milk Category Permissions Card */}
        <DetailSectionCard title="Milk Delivery Permissions" icon="🥛">
          <View style={styles.categoryPermissionsRow}>
            <Text style={styles.detailLabel}>Authorized Categories</Text>
            <View style={styles.badgesWrap}>
              {(customer.permittedCategories || []).map((cat) => (
                <MilkCategoryBadge key={cat} category={cat} />
              ))}
            </View>
          </View>
        </DetailSectionCard>

        {/* Financial & Bank Card */}
        {customer.bankAccountNumber || customer.bankName ? (
          <DetailSectionCard title="Banking Information" icon="🏦">
            <DetailRow label="Bank Name" value={customer.bankName || '—'} />
            <DetailRow label="Account Number" value={maskedAccount} />
            <DetailRow label="IFSC Code" value={customer.bankIfscCode || '—'} />
            <DetailRow
              label="Account Holder"
              value={customer.bankAccountHolderName || customer.fullName}
            />
          </DetailSectionCard>
        ) : null}

        {/* KYC Progress Tracker Card */}
        <View style={styles.kycCard}>
          <View style={styles.kycHeaderRow}>
            <View style={styles.kycIconPill}>
              <Text style={styles.kycIconEmoji}>🛡️</Text>
            </View>
            <Text style={styles.kycTitle}>KYC & Hardware Readiness Checklist</Text>
          </View>

          <KycStepItem
            stepName="Personal Details & Canonical UUID"
            isCompleted={true}
            note="Verified in PostgreSQL ledger"
          />
          <KycStepItem
            stepName="Unique Mobile Validation"
            isCompleted={true}
            note={customer.normalizedMobileNumber}
          />
          <KycStepItem
            stepName="Facial Biometric Enrollment"
            isCompleted={customer.status !== 'DRAFT' && customer.status !== 'PENDING_FACE_ENROLLMENT'}
            note={
              customer.status !== 'DRAFT' && customer.status !== 'PENDING_FACE_ENROLLMENT'
                ? 'MobileFaceNet Encrypted Template Active'
                : 'Pending Biometric Face Enrollment'
            }
          />
          <KycStepItem
            stepName="Physical RFID Card Assignment"
            isCompleted={customer.status === 'ACTIVE'}
            note={
              customer.status === 'ACTIVE'
                ? 'Active RFID Smart Card Bound'
                : 'Pending Hardware Assignment'
            }
          />
        </View>

        {/* Action Success Message */}
        {actionSuccessMessage ? (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerIcon}>✓</Text>
            <Text style={styles.successBannerText}>{actionSuccessMessage}</Text>
          </View>
        ) : null}

        {/* Biometric & Hardware Quick Actions */}
        <View style={styles.hardwareActionsCard}>
          <Text style={styles.hardwareActionsTitle}>Biometric & Smartcard Operations</Text>
          <View style={styles.hardwareButtonsCol}>
            <PrimaryButton
              text="Enroll Biometric Face"
              onClick={() =>
                navigation.navigate('FaceEnrollment', {
                  customerId: customer.id,
                  customerName: customer.fullName,
                  farmerCode: customer.farmerCode || '',
                })
              }
              leadingIcon="👤"
              variant="secondary"
            />
            <View style={{ height: 10 }} />
            <PrimaryButton
              text="Assign / Manage RFID Smartcard"
              onClick={() => navigation.navigate('RfidAssignment')}
              leadingIcon="💳"
              variant="outlined"
            />
          </View>
        </View>

        {/* Edit Button */}
        <PrimaryButton
          text="Edit Farmer Profile"
          onClick={() => navigation.navigate('CustomerEdit', { customerId })}
          leadingIcon="✏️"
        />

        {/* Soft-Delete or Restore Button */}
        {isSoftDeleted ? (
          <TouchableOpacity
            style={styles.restoreButton}
            activeOpacity={0.85}
            onPress={() => {
              setActionReason('');
              setShowRestoreDialog(true);
            }}
          >
            <Text style={styles.restoreIcon}>🔄</Text>
            <Text style={styles.restoreButtonText}>Restore Customer Profile</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.deactivateButton}
            activeOpacity={0.85}
            onPress={() => {
              setActionReason('');
              setShowDeactivateDialog(true);
            }}
          >
            <Text style={styles.deactivateIcon}>🗑️</Text>
            <Text style={styles.deactivateButtonText}>
              Deactivate Customer (Soft-Delete)
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Deactivate Dialog */}
      <ConfirmationDialog
        visible={showDeactivateDialog}
        title="Deactivate Customer Record"
        message="This customer will be soft-deleted. Historical milk collections, ledger balance, and payouts are permanently preserved in the PostgreSQL ledger."
        confirmText="Confirm Deactivation"
        confirmColor={clayColors.error}
        onConfirm={handleDeactivate}
        onDismiss={() => setShowDeactivateDialog(false)}
      >
        <TextInput
          style={styles.dialogInput}
          value={actionReason}
          onChangeText={setActionReason}
          placeholder="Enter audit reason (min 5 characters)"
          placeholderTextColor={clayColors.textMuted}
        />
      </ConfirmationDialog>

      {/* Restore Dialog */}
      <ConfirmationDialog
        visible={showRestoreDialog}
        title="Restore Customer Record"
        message="This customer record will be restored back to ACTIVE status in the organization."
        confirmText="Confirm Restore"
        confirmColor={clayColors.success}
        onConfirm={handleRestore}
        onDismiss={() => setShowRestoreDialog(false)}
      >
        <TextInput
          style={styles.dialogInput}
          value={actionReason}
          onChangeText={setActionReason}
          placeholder="Enter restoration reason (min 5 characters)"
          placeholderTextColor={clayColors.textMuted}
        />
      </ConfirmationDialog>
    </SafeAreaView>
  );
};

const DetailSectionCard: React.FC<{
  title: string;
  icon: string;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <View style={styles.sectionCard}>
    <View style={styles.sectionHeaderRow}>
      <View style={styles.sectionIconBadge}>
        <Text style={styles.sectionIcon}>{icon}</Text>
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.divider} />
    <View style={styles.sectionContent}>{children}</View>
  </View>
);

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const KycStepItem: React.FC<{
  stepName: string;
  isCompleted: boolean;
  note: string;
}> = ({ stepName, isCompleted, note }) => (
  <View style={styles.kycRow}>
    <View
      style={[
        styles.kycBadge,
        isCompleted ? styles.kycBadgeCompleted : styles.kycBadgePending,
      ]}
    >
      <Text style={isCompleted ? styles.kycCheck : styles.kycPending}>
        {isCompleted ? '✓' : '⏳'}
      </Text>
    </View>
    <View style={styles.kycTexts}>
      <Text style={styles.kycStepName}>{stepName}</Text>
      <Text style={styles.kycNote}>{note}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: clayColors.canvasBackground,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#DFE7ED',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EDF4F8',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#CDDCE6',
    borderBottomColor: '#BDCED8',
  },
  backIcon: {
    fontSize: 20,
    color: clayColors.primary,
    fontWeight: 'bold',
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: clayColors.primary,
  },
  editButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E5F3FA',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#BBD6E8',
    borderBottomColor: '#BBD6E8',
  },
  editIcon: {
    fontSize: 16,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 18,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatarPill: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E5F3FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  avatarText: {
    fontSize: 22,
  },
  headerTitleWrap: {
    flex: 1,
    marginRight: 8,
  },
  fullName: {
    fontSize: 18,
    fontWeight: '800',
    color: clayColors.textPrimary,
  },
  codePill: {
    marginTop: 3,
  },
  farmerCode: {
    fontSize: 12,
    fontWeight: '700',
    color: clayColors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  divider: {
    height: 1,
    backgroundColor: '#E8EFF5',
    marginVertical: 12,
  },
  uuidWrap: {
    backgroundColor: '#EDF5FA',
    padding: 10,
    borderRadius: clayRadius.sm,
    gap: 3,
  },
  uuidLabel: {
    fontSize: 11,
    color: clayColors.textMuted,
    fontWeight: '600',
  },
  uuidValue: {
    fontSize: 12,
    fontWeight: '700',
    color: clayColors.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 16,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EDF4F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  sectionIcon: {
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: clayColors.textPrimary,
  },
  sectionContent: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  detailLabel: {
    fontSize: 13,
    color: clayColors.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: clayColors.textPrimary,
  },
  categoryPermissionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgesWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  kycCard: {
    backgroundColor: '#EBF4F9',
    borderRadius: clayRadius.card,
    padding: 16,
    gap: 12,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#CFDEE8',
    borderBottomColor: '#BFD1DC',
  },
  kycHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  kycIconPill: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  kycIconEmoji: {
    fontSize: 14,
  },
  kycTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: clayColors.primary,
  },
  kycRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kycBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  kycBadgeCompleted: {
    backgroundColor: '#D1F0DA',
  },
  kycBadgePending: {
    backgroundColor: '#FEECC4',
  },
  kycCheck: {
    color: '#137333',
    fontWeight: 'bold',
    fontSize: 14,
  },
  kycPending: {
    color: '#B06000',
    fontSize: 12,
  },
  kycTexts: {
    flex: 1,
  },
  kycStepName: {
    fontSize: 13,
    fontWeight: '700',
    color: clayColors.textPrimary,
  },
  kycNote: {
    fontSize: 11,
    color: clayColors.textSecondary,
    marginTop: 1,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E4F6EB',
    borderRadius: clayRadius.md,
    padding: 12,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#BCE8CA',
    borderBottomColor: '#BCE8CA',
  },
  successBannerIcon: {
    fontSize: 16,
    color: '#137333',
    fontWeight: 'bold',
    marginRight: 8,
  },
  successBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#137333',
  },
  restoreButton: {
    flexDirection: 'row',
    height: 52,
    backgroundColor: clayColors.success,
    borderRadius: clayRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: 'rgba(255, 255, 255, 0.45)',
    borderLeftColor: 'rgba(255, 255, 255, 0.25)',
    borderRightColor: 'rgba(0, 40, 15, 0.25)',
    borderBottomColor: 'rgba(0, 30, 10, 0.45)',
  },
  restoreIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  restoreButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  deactivateButton: {
    flexDirection: 'row',
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#F9C2C2',
    borderBottomColor: '#E6A8A8',
  },
  deactivateIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  deactivateButtonText: {
    color: clayColors.error,
    fontSize: 14,
    fontWeight: '700',
  },
  dialogInput: {
    backgroundColor: '#EDF4F9',
    borderRadius: clayRadius.sm,
    padding: 12,
    marginTop: 8,
    fontSize: 14,
    color: clayColors.textPrimary,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 1,
    borderTopColor: '#CBDDE8',
    borderLeftColor: '#CBDDE8',
    borderRightColor: '#FFFFFF',
    borderBottomColor: '#FFFFFF',
  },
  hardwareActionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 16,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFDCE5',
  },
  hardwareActionsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: clayColors.primary,
    marginBottom: 12,
  },
  hardwareButtonsCol: {
    gap: 8,
  },
});
