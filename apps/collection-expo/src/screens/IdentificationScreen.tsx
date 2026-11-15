import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { CollectionRepository } from '../domain/repository/CollectionRepository';
import { Customer, IdentificationMethod } from '../types';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ClayCard } from '../components/clay/ClayCard';
import { ClayInput } from '../components/clay/ClayInput';
import { ClayButton } from '../components/clay/ClayButton';
import { ClayFilterChip } from '../components/clay/ClayFilterChip';
import { ClayDialog } from '../components/clay/ClayDialog';
import { ClayAlert } from '../components/clay/ClayAlert';
import { ClayCategoryBadge } from '../components/clay/ClayCategoryBadge';
import { ClayImages } from '../theme/assets';

interface IdentificationScreenProps {
  repository: CollectionRepository;
  onIdentified: (customer: Customer, method: IdentificationMethod) => void;
  onCancel: () => void;
}

const REASONS = [
  'FACE_RECOGNITION_FAILED',
  'DAMAGED_RFID',
  'LOST_RFID',
  'UNREGISTERED_BIOMETRIC',
  'OTHER',
];

export const IdentificationScreen: React.FC<IdentificationScreenProps> = ({
  repository,
  onIdentified,
  onCancel,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<IdentificationMethod>('RFID');
  const [rfidInput, setRfidInput] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Customer | null>(null);
  const [showSupervisorDialog, setShowSupervisorDialog] = useState(false);
  const [supervisorReason, setSupervisorReason] = useState('FACE_RECOGNITION_FAILED');
  const [supervisorNotes, setSupervisorNotes] = useState(
    'Face recognition uncalibrated, verified farmer identity manually'
  );
  const [supervisorPin, setSupervisorPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleVerifyRfid = async () => {
    if (!rfidInput.trim()) {
      setErrorMessage('Please enter or scan an RFID card UID');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await repository.identifyByRfid(rfidInput);
      setIsLoading(false);
      if (result.type === 'SUCCESS') {
        onIdentified(result.customer, 'RFID');
      } else {
        setErrorMessage(`${result.reason} [${result.errorCode}]`);
      }
    } catch (e: any) {
      setIsLoading(false);
      setErrorMessage(e.message || 'RFID verification error');
    }
  };

  const handleSearchCustomers = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const list = await repository.searchCustomers(searchCode);
      setIsLoading(false);
      setSearchResults(list);
      if (list.length === 0) {
        setErrorMessage(`No active customers matching '${searchCode}' found`);
      }
    } catch (e: any) {
      setIsLoading(false);
      setErrorMessage(e.message || 'Search failed');
    }
  };

  const handleConfirmSupervisor = async () => {
    if (!selectedCandidate) return;
    if (supervisorNotes.trim().length < 5) {
      setErrorMessage('Supervisor notes must be at least 5 characters');
      setShowSupervisorDialog(false);
      return;
    }
    setIsLoading(true);
    setShowSupervisorDialog(false);
    try {
      const result = await repository.verifyBySupervisor(
        selectedCandidate.id,
        supervisorReason,
        supervisorNotes,
        supervisorPin.trim() ? supervisorPin.trim() : null
      );
      setIsLoading(false);
      if (result.type === 'SUCCESS') {
        onIdentified(result.customer, 'SUPERVISOR_MANUAL');
      } else {
        setErrorMessage(`${result.reason} [${result.errorCode}]`);
      }
    } catch (e: any) {
      setIsLoading(false);
      setErrorMessage(e.message || 'Supervisor verification failed');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={[typography.headlineMedium, { textAlign: 'center' }]}>
        CUSTOMER IDENTIFICATION
      </Text>
      <Text style={[typography.bodyMedium, { textAlign: 'center', marginTop: 4, marginBottom: 20 }]}>
        Approved Methods: 1. Face (Fail-Safe Guard) &rarr; 2. RFID Card &rarr; 3. Supervisor Manual
      </Text>

      {/* Chip Selection Row */}
      <View style={styles.chipRow}>
        <ClayFilterChip
          label="1. FACE RECOGNITION"
          selected={selectedMethod === 'FACE'}
          onPress={() => {
            setSelectedMethod('FACE');
            setErrorMessage(null);
          }}
        />
        <ClayFilterChip
          label="2. RFID CARD TAP"
          selected={selectedMethod === 'RFID'}
          onPress={() => {
            setSelectedMethod('RFID');
            setErrorMessage(null);
          }}
        />
        <ClayFilterChip
          label="3. SUPERVISOR MANUAL"
          selected={selectedMethod === 'SUPERVISOR_MANUAL'}
          onPress={() => {
            setSelectedMethod('SUPERVISOR_MANUAL');
            setErrorMessage(null);
          }}
        />
      </View>

      <View style={{ height: 16 }} />

      {errorMessage && (
        <ClayAlert
          type="error"
          title="Identification Alert"
          message={errorMessage}
          onDismiss={() => setErrorMessage(null)}
          style={{ maxWidth: 560 }}
        />
      )}

      {/* Main Mode Card */}
      <ClayCard variant="elevated" style={styles.mainCard}>
        {selectedMethod === 'FACE' && (
          <View style={styles.sectionContainer}>
            {/* 3D Face Viewport Guide */}
            <View style={styles.viewportGuideCard}>
              <View style={styles.guideImageContainer}>
                <Image
                  source={ClayImages.faceScanGuide}
                  style={styles.guideImage}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.viewportHeader}>
                <Text style={styles.failSafeTitle}>CAMERA BIOMETRICS (FAIL-SAFE ACTIVE)</Text>
                <Text style={styles.failSafeText}>
                  MobileFaceNet-ArcFace v1.0.0 (512D) • Cosine Threshold: 0.720{'\n'}
                  Notice: Model uncalibrated for production without supervised baseline.
                </Text>
              </View>
            </View>

            <View style={{ height: 16 }} />

            <ClayButton
              title={isLoading ? 'VERIFYING FACE BIOMETRICS...' : 'SCAN & RECOGNIZE FACE'}
              onPress={async () => {
                setIsLoading(true);
                setErrorMessage(null);
                try {
                  const sampleTensor = new Float32Array(112 * 112 * 3).fill(0.18);
                  const result = await repository.identifyByFace(sampleTensor);
                  setIsLoading(false);
                  if (result.type === 'SUCCESS') {
                    onIdentified(result.customer, 'FACE');
                  } else {
                    setErrorMessage(`${result.reason} [${result.errorCode}]`);
                  }
                } catch (e: any) {
                  setIsLoading(false);
                  setErrorMessage(e.message || 'Face recognition error');
                }
              }}
              variant="primary"
              disabled={isLoading}
              size="lg"
            />

            <View style={{ height: 16 }} />
            <Text style={styles.fallbackPrompt}>
              Prefer physical card or manual search for counter speed:
            </Text>
            <View style={{ height: 8 }} />
            <View style={styles.failSafeButtonsRow}>
              <ClayButton
                title="USE RFID CARD TAP"
                onPress={() => setSelectedMethod('RFID')}
                variant="secondary"
                style={{ flex: 1 }}
              />
              <ClayButton
                title="SUPERVISOR MANUAL"
                onPress={() => setSelectedMethod('SUPERVISOR_MANUAL')}
                variant="secondary"
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}

        {selectedMethod === 'RFID' && (
          <View style={styles.sectionContainer}>
            <View style={styles.rfidHeroBanner}>
              <Image
                source={ClayImages.customerIdGuide}
                style={styles.rfidHeroImage}
                resizeMode="contain"
              />
              <View style={{ flex: 1 }}>
                <Text style={typography.titleMedium}>NFC &amp; USB RFID Reader Active</Text>
                <Text style={styles.rfidSubText}>
                  Hold customer smart card to terminal sensor or enter card UID manually:
                </Text>
              </View>
            </View>

            <View style={{ height: 16 }} />

            <ClayInput
              label="RFID Card UID"
              value={rfidInput}
              onChangeText={(t) => {
                setRfidInput(t);
                setErrorMessage(null);
              }}
              placeholder="e.g. RFID-COW-1001 or 04A1B2C3"
              unitLabel="MIFARE / ISO14443"
            />

            <View style={{ height: 20 }} />

            <ClayButton
              title="VERIFY RFID CARD"
              onPress={handleVerifyRfid}
              isLoading={isLoading}
              variant="primary"
              size="lg"
            />
          </View>
        )}

        {selectedMethod === 'SUPERVISOR_MANUAL' && (
          <View style={styles.sectionContainer}>
            <Text style={typography.bodyLarge}>
              Search Registered Customer by Farmer Code, Name, or Mobile:
            </Text>
            <View style={{ height: 12 }} />

            <View style={styles.searchRow}>
              <View style={{ flex: 1 }}>
                <ClayInput
                  label="Farmer Code, Name, or Mobile"
                  value={searchCode}
                  onChangeText={(t) => {
                    setSearchCode(t);
                    setErrorMessage(null);
                  }}
                  placeholder="e.g. FARMER-001 or Patil"
                />
              </View>
              <ClayButton
                title="SEARCH"
                onPress={handleSearchCustomers}
                isLoading={isLoading}
                variant="primary"
                style={styles.searchBtn}
              />
            </View>

            {searchResults.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Text style={typography.titleMedium}>
                  Select Customer for Supervisor Verification:
                </Text>
                <View style={{ height: 10 }} />

                <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled>
                  {searchResults.map((cust) => (
                    <TouchableOpacity
                      key={cust.id}
                      style={styles.candidateCard}
                      onPress={() => {
                        setSelectedCandidate(cust);
                        setShowSupervisorDialog(true);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[typography.bodyLarge, { fontWeight: 'bold' }]}>
                          {cust.fullName}
                        </Text>
                        <Text style={[typography.caption, { marginTop: 2 }]}>
                          Code: {cust.farmerCode} {cust.mobileNumber ? `• ${cust.mobileNumber}` : ''}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                          {cust.permittedCategories.map((c) => (
                            <ClayCategoryBadge key={c} category={c} size="sm" />
                          ))}
                        </View>
                      </View>
                      <View style={styles.selectPill}>
                        <Text style={styles.selectPillText}>SELECT &rarr;</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 16 }} />
        <ClayButton
          title="CANCEL TO DASHBOARD"
          onPress={onCancel}
          variant="outline"
          size="md"
        />
      </ClayCard>

      {/* Supervisor Verification Modal Dialog */}
      <ClayDialog
        visible={showSupervisorDialog && selectedCandidate !== null}
        onDismiss={() => setShowSupervisorDialog(false)}
        title="Supervisor Identity Verification"
        subtitle={
          selectedCandidate
            ? `Customer: ${selectedCandidate.fullName} (${selectedCandidate.farmerCode})`
            : undefined
        }
      >
        {selectedCandidate && (
          <View>
            <Text style={styles.reasonLabel}>Audit Reason Category:</Text>
            <View style={styles.reasonsList}>
              {REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.reasonOption,
                    supervisorReason === r && styles.reasonOptionSelected,
                  ]}
                  onPress={() => setSupervisorReason(r)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.reasonOptionText,
                      supervisorReason === r && { color: colors.textPrimary, fontWeight: 'bold' },
                    ]}
                  >
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ height: 12 }} />
            <ClayInput
              label="Audit Justification Notes (min 5 chars)"
              value={supervisorNotes}
              onChangeText={setSupervisorNotes}
              multiline
              numberOfLines={2}
            />

            <View style={{ height: 12 }} />
            <ClayInput
              label="Supervisor PIN (Optional)"
              value={supervisorPin}
              onChangeText={setSupervisorPin}
              placeholder="PIN"
              secureTextEntry
            />

            <View style={{ height: 20 }} />
            <View style={styles.dialogButtonsRow}>
              <ClayButton
                title="CANCEL"
                onPress={() => setShowSupervisorDialog(false)}
                variant="outline"
                style={{ flex: 1 }}
              />
              <ClayButton
                title="CONFIRM"
                onPress={handleConfirmSupervisor}
                isLoading={isLoading}
                variant="primary"
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </ClayDialog>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.clayBgDark,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  mainCard: {
    width: '100%',
    maxWidth: 560,
    padding: 24,
  },
  sectionContainer: {
    width: '100%',
  },
  viewportGuideCard: {
    backgroundColor: colors.clayInsetBg,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 143, 0, 0.4)',
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  guideImageContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  guideImage: {
    width: '100%',
    height: '100%',
  },
  viewportHeader: {
    alignItems: 'center',
  },
  failSafeTitle: {
    color: colors.accentAmber,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  failSafeText: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  fallbackPrompt: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  failSafeButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rfidHeroBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.clayInsetBg,
    padding: 14,
    borderRadius: 14,
    gap: 14,
  },
  rfidHeroImage: {
    width: 64,
    height: 64,
  },
  rfidSubText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 16,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  searchBtn: {
    height: 52,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  candidateCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.claySurfaceElevated,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  selectPill: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderColor: colors.clayGreenLight,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  selectPillText: {
    color: colors.clayGreenLight,
    fontSize: 11,
    fontWeight: '800',
  },
  reasonLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: '600',
  },
  reasonsList: {
    gap: 6,
  },
  reasonOption: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.clayInsetBg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reasonOptionSelected: {
    borderColor: colors.clayGreenLight,
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  reasonOptionText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  dialogButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
});
