/**
 * DFarm Registration App - RFID Assignment & Management Screen
 * Complete parity with Kotlin RfidAssignmentScreen.kt & RfidAssignmentViewModel.kt
 * Transformed with Premium 3D Claymorphism Aesthetics
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
const Icon = Ionicons as unknown as React.ComponentType<any>;
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';
import { rfidAdapter } from '../hardware/RfidReaderAdapter';
import { customerApi } from '../api/customerApi';
import { rfidApi } from '../api/rfidApi';
import { CustomerDto, RfidAssignmentDto } from '../types/models';
import { useAuth } from '../auth/AuthContext';
import { PrimaryButton } from '../components/PrimaryButton';

export const RfidAssignmentScreen: React.FC = () => {
  const navigation = useNavigation();
  const { officer } = useAuth();

  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDto | null>(null);
  const [rawUidInput, setRawUidInput] = useState('');
  const [normalizedUid, setNormalizedUid] = useState('');
  const [isValidUid, setIsValidUid] = useState(false);
  const [activeAssignment, setActiveAssignment] = useState<RfidAssignmentDto | null>(null);
  const [assignmentHistory, setAssignmentHistory] = useState<RfidAssignmentDto[]>([]);
  const [isReplacing, setIsReplacing] = useState(false);
  const [replacementReason, setReplacementReason] = useState('DAMAGED');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Dialog states
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [dialogReason, setDialogReason] = useState('');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  const isCustomerFaceEnrolled = (c: CustomerDto) =>
    c.status !== 'PENDING_FACE_ENROLLMENT' && c.status !== 'DRAFT';

  const loadCustomers = useCallback(async () => {
    try {
      const res = await customerApi.listCustomers({ page: 1, limit: 100 });
      setCustomers(res.items);
      if (res.items.length > 0 && !selectedCustomer) {
        setSelectedCustomer(res.items[0]);
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to fetch customer list');
    }
  }, [selectedCustomer]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const refreshCustomerAssignments = useCallback(async (customerId: string) => {
    try {
      const status = await rfidApi.getRfidStatus(customerId);
      const active: RfidAssignmentDto | null =
        status.hasActiveCard && status.activeCard
          ? {
              id: status.activeCard.cardId || 'active',
              cardUid: status.activeCard.cardUid,
              assignedAt: status.activeCard.assignedAt || 'N/A',
              assignedBy: 'System Officer',
              isActive: true,
            }
          : null;
      setActiveAssignment(active);

      const history: RfidAssignmentDto[] = (status.assignmentHistory || []).map((h) => ({
        id: h.id || h.cardId || h.cardUid,
        cardUid: h.cardUid,
        isActive: h.isActive,
        assignedAt: h.assignedAt || '',
        assignedBy: h.assignedBy || 'Officer',
        revokedAt: h.revokedAt,
        revocationReason: h.revocationReason,
      }));

      setAssignmentHistory(
        history.sort(
          (a, b) => new Date(b.assignedAt || 0).getTime() - new Date(a.assignedAt || 0).getTime()
        )
      );
    } catch {
      setActiveAssignment(null);
      setAssignmentHistory([]);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomer) {
      refreshCustomerAssignments(selectedCustomer.id);
    }
  }, [selectedCustomer, refreshCustomerAssignments]);

  const handleSelectCustomer = (customer: CustomerDto) => {
    setSelectedCustomer(customer);
    setRawUidInput('');
    setNormalizedUid('');
    setIsValidUid(false);
    setIsReplacing(false);
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowCustomerPicker(false);
  };

  const onUidInputChanged = (input: string) => {
    const normalized = rfidAdapter.normalizeUid(input);
    const valid = rfidAdapter.isValidHexUid(normalized);
    setRawUidInput(input);
    setNormalizedUid(normalized);
    setIsValidUid(valid);
    setErrorMessage(null);
  };

  const handleAssignCard = async () => {
    if (!selectedCustomer) return;
    if (!isValidUid) {
      setErrorMessage('Enter a valid hexadecimal RFID UID');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const assignment = await rfidApi.assignRfid(selectedCustomer.id, normalizedUid);
      setRawUidInput('');
      setNormalizedUid('');
      setIsValidUid(false);
      setSuccessMessage(`Card ${assignment.cardUid} successfully assigned! Registration status updated.`);
      await refreshCustomerAssignments(selectedCustomer.id);
      await loadCustomers();
    } catch (e: any) {
      setErrorMessage(e?.message || 'Assignment failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmReplacement = async () => {
    if (!selectedCustomer) return;
    if (!isValidUid) {
      setErrorMessage('Enter a valid hexadecimal RFID UID');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const assignment = await rfidApi.replaceRfid(selectedCustomer.id, normalizedUid, replacementReason);
      setIsReplacing(false);
      setRawUidInput('');
      setNormalizedUid('');
      setIsValidUid(false);
      setSuccessMessage(`Replacement card ${assignment.cardUid} successfully assigned!`);
      await refreshCustomerAssignments(selectedCustomer.id);
      await loadCustomers();
    } catch (e: any) {
      setErrorMessage(e?.message || 'Replacement failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!activeAssignment) return;
    setIsLoading(true);
    try {
      await rfidApi.revokeRfid(activeAssignment.id || activeAssignment.cardUid || '', dialogReason.trim() || 'MANUAL_REVOCATION');
      setShowRevokeDialog(false);
      setDialogReason('');
      setSuccessMessage('Card successfully revoked.');
      if (selectedCustomer) {
        await refreshCustomerAssignments(selectedCustomer.id);
        await loadCustomers();
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to revoke card');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!activeAssignment) return;
    setIsLoading(true);
    try {
      await rfidApi.blockRfid(activeAssignment.id || activeAssignment.cardUid || '', dialogReason.trim() || 'SECURITY_BLOCK');
      setShowBlockDialog(false);
      setDialogReason('');
      setSuccessMessage('Card successfully blocked.');
      if (selectedCustomer) {
        await refreshCustomerAssignments(selectedCustomer.id);
        await loadCustomers();
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to block card');
    } finally {
      setIsLoading(false);
    }
  };

  const reasons = ['DAMAGED', 'LOST', 'STOLEN', 'DEFECTIVE'];

  return (
    <SafeAreaView style={styles.container}>
      {/* 3D Clay Top App Bar */}
      <View style={styles.topAppBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Back"
          activeOpacity={0.8}
        >
          <Icon name="arrow-back" size={20} color={clayColors.primary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>RFID Card Provisioning</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Hardware Boundary Banner */}
        <View style={styles.boundaryCard}>
          <View style={styles.boundaryRow}>
            <View style={styles.boundaryIconWrap}>
              <Icon name="hardware-chip-outline" size={20} color="#B78103" />
            </View>
            <View style={styles.boundaryContent}>
              <Text style={styles.boundaryTitle}>
                HARDWARE STATUS: {rfidAdapter.sourceLabel}
              </Text>
              <Text style={styles.boundarySubtitle}>
                Physical reader integration is deferred. Enter hexadecimal UID manually
                for testing, card provisioning, and canonical ledger association.
              </Text>
            </View>
          </View>
        </View>

        {/* 2. Feedback Banners */}
        {errorMessage ? (
          <View style={styles.errorBanner}>
            <Icon name="warning" size={18} color={clayColors.error} />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.dismissPill}
              onPress={() => setErrorMessage(null)}
            >
              <Text style={styles.errorDismiss}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {successMessage ? (
          <View style={styles.successBanner}>
            <Icon name="checkmark-circle" size={18} color="#137333" />
            <Text style={styles.successBannerText}>{successMessage}</Text>
            <TouchableOpacity
              style={styles.dismissPillGreen}
              onPress={() => setSuccessMessage(null)}
            >
              <Text style={styles.successDismiss}>OK</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* 3. Customer Selection Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.fieldLabel}>Select Registered Farmer</Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            activeOpacity={0.8}
            onPress={() => setShowCustomerPicker(true)}
          >
            <View style={styles.dropdownLeft}>
              <Text style={styles.dropdownEmoji}>🧑‍🌾</Text>
              <Text style={styles.dropdownValue}>
                {selectedCustomer
                  ? `${selectedCustomer.farmerCode} - ${selectedCustomer.fullName}`
                  : 'Select Customer'}
              </Text>
            </View>
            <View style={styles.dropdownChevron}>
              <Icon name="chevron-down" size={18} color={clayColors.primary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* 4. Selected Customer Details & Canonical UUID */}
        {selectedCustomer && (
          <View style={styles.profileCard}>
            <View style={styles.profileHeaderRow}>
              <Text style={styles.cardHeader}>Farmer Identity Profile</Text>
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor:
                      selectedCustomer.status === 'ACTIVE' ? '#E4F6EB' : '#FEF6E4',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    {
                      color:
                        selectedCustomer.status === 'ACTIVE' ? '#137333' : '#B06000',
                    },
                  ]}
                >
                  {selectedCustomer.status}
                </Text>
              </View>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Customer Name:</Text>
              <Text style={styles.detailValue}>{selectedCustomer.fullName}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Farmer Code:</Text>
              <Text style={[styles.detailValue, styles.boldText]}>
                {selectedCustomer.farmerCode}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Biometric Status:</Text>
              <Text
                style={[
                  styles.detailValue,
                  styles.boldText,
                  {
                    color: isCustomerFaceEnrolled(selectedCustomer)
                      ? '#137333'
                      : '#BA1A1A',
                  },
                ]}
              >
                {isCustomerFaceEnrolled(selectedCustomer) ? 'ENROLLED' : 'PENDING'}
              </Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.uuidBox}>
              <Text style={styles.uuidLabel}>Canonical PostgreSQL UUID:</Text>
              <Text style={styles.uuidValue}>{selectedCustomer.id}</Text>
            </View>
          </View>
        )}

        {/* 5. Active Card Status or Assignment Form */}
        {selectedCustomer && (
          <>
            {activeAssignment && !isReplacing ? (
              <View style={styles.activeCard}>
                <View style={styles.activeCardHeaderRow}>
                  <View style={styles.activeIconPill}>
                    <Icon name="card" size={20} color="#FFFFFF" />
                  </View>
                  <View style={styles.activeHeaderWrap}>
                    <Text style={styles.activeCardTitle}>Active RFID Smart Card</Text>
                    <Text style={styles.activeCardSub}>Authorized for Milk Weighing & Intake</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Assigned Card UID:</Text>
                  <Text style={[styles.detailValue, styles.monoText, styles.boldText]}>
                    {activeAssignment.cardUid}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Assigned At:</Text>
                  <Text style={styles.detailValue}>{activeAssignment.assignedAt}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Assigned By:</Text>
                  <Text style={styles.detailValue}>{activeAssignment.assignedBy}</Text>
                </View>

                <View style={styles.activeCardActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.replaceBtn]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setIsReplacing(true);
                      setRawUidInput('');
                      setNormalizedUid('');
                      setIsValidUid(false);
                    }}
                  >
                    <Text style={styles.replaceBtnText}>Replace Card</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.revokeBtn]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setDialogReason('');
                      setShowRevokeDialog(true);
                    }}
                  >
                    <Text style={styles.revokeBtnText}>Revoke</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.blockBtn]}
                    activeOpacity={0.85}
                    onPress={() => {
                      setDialogReason('');
                      setShowBlockDialog(true);
                    }}
                  >
                    <Text style={styles.blockBtnText}>Block</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.formCard}>
                <Text style={styles.formCardTitle}>
                  {isReplacing ? 'Replace Active RFID Card' : 'Assign New RFID Card'}
                </Text>

                {isReplacing && (
                  <View style={styles.replacementReasonSection}>
                    <Text style={styles.subLabel}>Select Replacement Reason:</Text>
                    <View style={styles.radioGroup}>
                      {reasons.map((reason) => (
                        <TouchableOpacity
                          key={reason}
                          activeOpacity={0.8}
                          style={[
                            styles.radioRow,
                            replacementReason === reason && styles.radioRowActive,
                          ]}
                          onPress={() => setReplacementReason(reason)}
                        >
                          <Icon
                            name={
                              replacementReason === reason
                                ? 'radio-button-on'
                                : 'radio-button-off'
                            }
                            size={18}
                            color={clayColors.primary}
                          />
                          <Text style={styles.radioLabel}>{reason}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.inputContainer}>
                  <Text style={styles.inputTitle}>
                    MANUAL HEXADECIMAL UID ENTRY
                  </Text>
                  <View style={styles.textInputWrap}>
                    <TextInput
                      style={styles.textInput}
                      value={rawUidInput}
                      onChangeText={onUidInputChanged}
                      placeholder="e.g. 04:A1:B2:C3:D4 or 04A1B2C3D4"
                      placeholderTextColor={clayColors.textMuted}
                      autoCapitalize="characters"
                      autoCorrect={false}
                    />
                  </View>
                  {normalizedUid.length > 0 && (
                    <View
                      style={[
                        styles.uidValidationPill,
                        { backgroundColor: isValidUid ? '#E4F6EB' : '#FDECEC' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.supportingText,
                          { color: isValidUid ? '#137333' : clayColors.error },
                        ]}
                      >
                        Normalized: {normalizedUid} ({isValidUid ? '✓ Valid Hex UID' : '✕ Invalid Hex Format'})
                      </Text>
                    </View>
                  )}
                </View>

                {isReplacing ? (
                  <View style={styles.replacementActions}>
                    <TouchableOpacity
                      style={[
                        styles.submitBtn,
                        (!isValidUid || isLoading) && styles.disabledBtn,
                      ]}
                      disabled={!isValidUid || isLoading}
                      onPress={handleConfirmReplacement}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.submitBtnText}>Confirm Card Replacement</Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelOutlinedBtn}
                      onPress={() => setIsReplacing(false)}
                    >
                      <Text style={styles.cancelOutlinedText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      (!isValidUid || isLoading || activeAssignment != null) &&
                        styles.disabledBtn,
                    ]}
                    disabled={
                      !isValidUid || isLoading || activeAssignment != null
                    }
                    onPress={handleAssignCard}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <View style={styles.btnContentRow}>
                        <Icon name="card-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.submitBtnText}>Assign RFID Smart Card</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* 6. Assignment History */}
            <View style={styles.historySection}>
              <Text style={styles.historyHeader}>
                Assignment History ({assignmentHistory.length})
              </Text>
              {assignmentHistory.length === 0 ? (
                <View style={styles.emptyHistoryBox}>
                  <Text style={styles.emptyHistoryText}>
                    No prior RFID card history recorded for this customer.
                  </Text>
                </View>
              ) : (
                assignmentHistory.map((item, idx) => (
                  <View
                    key={item.id || idx}
                    style={[
                      styles.historyCard,
                      { backgroundColor: item.isActive ? '#FFFFFF' : '#F8FAFC' },
                    ]}
                  >
                    <View style={styles.historyCardRow}>
                      <Text style={[styles.monoText, styles.boldText]}>{item.cardUid}</Text>
                      <View
                        style={[
                          styles.historyStatusPill,
                          { backgroundColor: item.isActive ? '#E4F6EB' : '#EDF2F7' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.historyStatusText,
                            { color: item.isActive ? '#137333' : '#64748B' },
                          ]}
                        >
                          {item.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.historyMetaText}>
                      Assigned: {item.assignedAt} by {item.assignedBy}
                    </Text>
                    {item.revokedAt ? (
                      <Text style={[styles.historyMetaText, { color: clayColors.error }]}>
                        Revoked: {item.revokedAt} • Reason: {item.revocationReason || 'None'}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Customer Picker Modal */}
      <Modal visible={showCustomerPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Select Registered Customer</Text>
            </View>
            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {customers.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.pickerItem}
                  activeOpacity={0.8}
                  onPress={() => handleSelectCustomer(c)}
                >
                  <View style={styles.pickerAvatar}>
                    <Text style={styles.pickerEmoji}>🧑‍🌾</Text>
                  </View>
                  <View style={styles.pickerTexts}>
                    <Text style={styles.pickerItemName}>
                      {c.farmerCode} - {c.fullName}
                    </Text>
                    <Text style={styles.pickerItemSub}>
                      Status: {c.status} | Face: {isCustomerFaceEnrolled(c) ? 'Enrolled' : 'Pending'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.dialogCancelBtn}
              onPress={() => setShowCustomerPicker(false)}
            >
              <Text style={styles.dialogCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Revoke Dialog */}
      <Modal visible={showRevokeDialog} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <Text style={styles.dialogTitle}>Revoke Active RFID Card</Text>
            <Text style={styles.dialogMessage}>
              Are you sure you want to revoke card {activeAssignment?.cardUid}? The farmer will require a replacement to resume intake.
            </Text>
            <TextInput
              style={styles.dialogInput}
              value={dialogReason}
              onChangeText={setDialogReason}
              placeholder="e.g. Farmer requested deactivation"
              placeholderTextColor={clayColors.textMuted}
            />
            <View style={styles.dialogBtnRow}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setShowRevokeDialog(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogConfirmBtn, { backgroundColor: clayColors.error }]}
                onPress={handleRevoke}
              >
                <Text style={styles.dialogConfirmText}>Revoke Card</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Block Dialog */}
      <Modal visible={showBlockDialog} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalDialog}>
            <Text style={styles.dialogTitle}>Block Suspicious RFID Card</Text>
            <Text style={styles.dialogMessage}>
              Card {activeAssignment?.cardUid} will be placed into BLOCKED security status.
            </Text>
            <TextInput
              style={styles.dialogInput}
              value={dialogReason}
              onChangeText={setDialogReason}
              placeholder="e.g. Suspected fraudulent presentation"
              placeholderTextColor={clayColors.textMuted}
            />
            <View style={styles.dialogBtnRow}>
              <TouchableOpacity
                style={styles.dialogCancelBtn}
                onPress={() => setShowBlockDialog(false)}
              >
                <Text style={styles.dialogCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogConfirmBtn, { backgroundColor: clayColors.error }]}
                onPress={handleBlock}
              >
                <Text style={styles.dialogConfirmText}>Block Card</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: clayColors.canvasBackground,
  },
  topAppBar: {
    height: 56,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
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
  topBarTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: clayColors.primary,
  },
  placeholder: {
    width: 38,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  boundaryCard: {
    backgroundColor: '#FFF8E6',
    borderRadius: clayRadius.card,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#FDE0A8',
    borderBottomColor: '#F2D08E',
    padding: 14,
  },
  boundaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  boundaryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boundaryContent: {
    marginLeft: 12,
    flex: 1,
  },
  boundaryTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B78103',
  },
  boundarySubtitle: {
    fontSize: 12,
    color: '#5D4037',
    marginTop: 2,
    lineHeight: 17,
  },
  errorBanner: {
    backgroundColor: clayColors.errorSurface,
    borderRadius: clayRadius.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderBottomColor: clayColors.errorBorder,
  },
  errorBannerText: {
    flex: 1,
    color: clayColors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  dismissPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  errorDismiss: {
    color: clayColors.error,
    fontSize: 11,
    fontWeight: '700',
  },
  successBanner: {
    backgroundColor: '#E4F6EB',
    borderRadius: clayRadius.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderBottomColor: '#BCE8CA',
  },
  successBannerText: {
    flex: 1,
    color: '#137333',
    fontSize: 13,
    fontWeight: '600',
  },
  dismissPillGreen: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  successDismiss: {
    color: '#137333',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 16,
    gap: 8,
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
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: clayColors.textSecondary,
    marginBottom: 4,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E5EEF5',
    borderRadius: clayRadius.md,
    paddingHorizontal: 12,
    height: 50,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 1,
    borderTopColor: '#C4D5E2',
    borderLeftColor: '#CAD9E5',
    borderRightColor: '#FFFFFF',
    borderBottomColor: '#FFFFFF',
  },
  dropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dropdownEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  dropdownValue: {
    fontSize: 14,
    fontWeight: '700',
    color: clayColors.textPrimary,
  },
  dropdownChevron: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 16,
    gap: 10,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
  },
  profileHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: clayColors.textPrimary,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: clayRadius.pill,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: clayColors.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: clayColors.textPrimary,
  },
  boldText: {
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: '#E8EFF5',
    marginVertical: 4,
  },
  uuidBox: {
    backgroundColor: '#EDF5FA',
    padding: 10,
    borderRadius: clayRadius.sm,
    gap: 2,
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
  activeCard: {
    backgroundColor: '#EBF4FB',
    borderRadius: clayRadius.card,
    padding: 18,
    gap: 12,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#CFDEEC',
    borderBottomColor: '#BDD0E0',
  },
  activeCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeIconPill: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: clayColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  activeHeaderWrap: {
    flex: 1,
  },
  activeCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: clayColors.primary,
  },
  activeCardSub: {
    fontSize: 11,
    color: clayColors.textSecondary,
    marginTop: 1,
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
  },
  activeCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  actionBtn: {
    flex: 1,
    height: 42,
    borderRadius: clayRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replaceBtn: {
    backgroundColor: clayColors.primary,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.4)',
    borderBottomWidth: 2.5,
    borderBottomColor: 'rgba(0,25,40,0.4)',
  },
  replaceBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  revokeBtn: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1.5,
    borderTopColor: '#FFFFFF',
    borderBottomWidth: 2.5,
    borderBottomColor: '#F8B6B6',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#F8B6B6',
  },
  revokeBtnText: {
    color: clayColors.error,
    fontSize: 12,
    fontWeight: '700',
  },
  blockBtn: {
    backgroundColor: '#FDECEC',
    borderTopWidth: 1.5,
    borderTopColor: '#FFFFFF',
    borderBottomWidth: 2.5,
    borderBottomColor: '#F8A4A4',
  },
  blockBtnText: {
    color: clayColors.error,
    fontSize: 12,
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 18,
    gap: 14,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
  },
  formCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: clayColors.textPrimary,
  },
  replacementReasonSection: {
    gap: 8,
  },
  subLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: clayColors.textSecondary,
  },
  radioGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF4F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: clayRadius.sm,
    gap: 6,
  },
  radioRowActive: {
    backgroundColor: '#E0F0F8',
    borderColor: clayColors.primary,
    borderWidth: 1,
  },
  radioLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: clayColors.textPrimary,
  },
  inputContainer: {
    gap: 6,
  },
  inputTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: clayColors.textMuted,
    letterSpacing: 0.5,
  },
  textInputWrap: {
    backgroundColor: '#E5EEF5',
    borderRadius: clayRadius.md,
    paddingHorizontal: 12,
    borderTopWidth: 2,
    borderLeftWidth: 1.5,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: '#C4D5E2',
    borderLeftColor: '#CAD9E5',
    borderRightColor: '#FFFFFF',
    borderBottomColor: '#FFFFFF',
  },
  textInput: {
    height: 50,
    fontSize: 15,
    fontWeight: '700',
    color: clayColors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  uidValidationPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: clayRadius.sm,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  supportingText: {
    fontSize: 12,
    fontWeight: '700',
  },
  replacementActions: {
    gap: 8,
  },
  submitBtn: {
    height: 52,
    backgroundColor: clayColors.primary,
    borderRadius: clayRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: 'rgba(255, 255, 255, 0.45)',
    borderLeftColor: 'rgba(255, 255, 255, 0.25)',
    borderRightColor: 'rgba(0, 30, 45, 0.25)',
    borderBottomColor: 'rgba(0, 20, 35, 0.5)',
  },
  disabledBtn: {
    opacity: 0.5,
    borderBottomWidth: 1,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  cancelOutlinedBtn: {
    height: 48,
    borderRadius: clayRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF3F8',
    borderWidth: 1,
    borderColor: '#CBDCE8',
  },
  cancelOutlinedText: {
    fontSize: 13,
    fontWeight: '700',
    color: clayColors.textSecondary,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historySection: {
    marginTop: 6,
    gap: 10,
  },
  historyHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: clayColors.textPrimary,
  },
  emptyHistoryBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.md,
    padding: 16,
    alignItems: 'center',
  },
  emptyHistoryText: {
    fontSize: 13,
    color: clayColors.textMuted,
  },
  historyCard: {
    borderRadius: clayRadius.md,
    padding: 14,
    gap: 4,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
  },
  historyCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  historyMetaText: {
    fontSize: 12,
    color: clayColors.textSecondary,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 20, 32, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalDialog: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.dialog,
    padding: 22,
    gap: 14,
    borderTopWidth: 2.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 4,
    borderTopColor: '#FFFFFF',
    borderLeftColor: 'rgba(255, 255, 255, 0.9)',
    borderRightColor: '#D8E4EC',
    borderBottomColor: '#C4D5E2',
  },
  dialogHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#EDF3F8',
    paddingBottom: 10,
  },
  dialogTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: clayColors.textPrimary,
  },
  dialogMessage: {
    fontSize: 13,
    color: clayColors.textSecondary,
    lineHeight: 18,
  },
  dialogInput: {
    backgroundColor: '#EDF4F9',
    borderRadius: clayRadius.sm,
    padding: 12,
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
  dialogBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  dialogCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: clayRadius.md,
    backgroundColor: '#EDF3F7',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#FFFFFF',
  },
  dialogCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: clayColors.textSecondary,
  },
  dialogConfirmBtn: {
    flex: 1,
    height: 46,
    borderRadius: clayRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.4)',
    borderBottomWidth: 2.5,
    borderBottomColor: 'rgba(0,0,0,0.3)',
  },
  dialogConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F8',
  },
  pickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EDF5FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  pickerEmoji: {
    fontSize: 18,
  },
  pickerTexts: {
    flex: 1,
  },
  pickerItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: clayColors.textPrimary,
  },
  pickerItemSub: {
    fontSize: 11,
    color: clayColors.textMuted,
    marginTop: 2,
  },
});
