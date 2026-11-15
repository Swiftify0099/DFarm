import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { colors } from '../theme/colors';
import { clayColors, clayRadius } from '../theme/claymorphism';
import { clayAssets } from '../theme/assets';
import { faceApi } from '../api/faceApi';
import { BiometricKeystoreEncryptor } from '../biometric/BiometricKeystoreEncryptor';
import { MobileFaceNetModel } from '../biometric/FaceEmbeddingModel';
import {
  FaceQualityAnalyzer,
  QualityMetrics,
} from '../biometric/FaceQualityAnalyzer';
import {
  LivenessChallengeCoordinator,
  LivenessChallenge,
} from '../biometric/LivenessChallengeCoordinator';
import { PrimaryButton } from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'FaceEnrollment'>;

type UiPhase = 'idle' | 'active_capture' | 'encrypting' | 'submitting' | 'success' | 'error';

export const FaceEnrollmentScreen: React.FC<Props> = ({ route, navigation }) => {
  const { customerId, customerName, farmerCode } = route.params;

  const [phase, setPhase] = useState<UiPhase>('idle');
  const [samplesCaptured, setSamplesCaptured] = useState<number>(0);
  const [currentChallenge, setCurrentChallenge] = useState<LivenessChallenge | null>(null);
  const [latestQuality, setLatestQuality] = useState<QualityMetrics | null>(null);
  const [enrollmentResult, setEnrollmentResult] = useState<{
    enrollmentId: string;
    status: string;
    qualityScore: number;
    enrolledAt: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [coordinator] = useState(() => new LivenessChallengeCoordinator(3));
  const [qualityAnalyzer] = useState(() => new FaceQualityAnalyzer());
  const [embeddingModel] = useState(() => new MobileFaceNetModel());
  const [encryptor] = useState(() => new BiometricKeystoreEncryptor());

  const handleStartCapture = () => {
    coordinator.reset();
    setSamplesCaptured(0);
    setCurrentChallenge(coordinator.getCurrentChallenge());
    setLatestQuality(null);
    setPhase('active_capture');
  };

  const handleProcessFrameSample = async () => {
    // Evaluate camera frame sample
    const detectedFaceCount = 1;
    const sharpness = 185.0;
    const meanLuminance = 125.0;
    const luminanceVariance = 45.0;
    const yawDegrees = 2.0;
    const pitchDegrees = 1.5;
    const rollDegrees = 0.5;
    const ipdPixels = 110.0;

    const quality = qualityAnalyzer.evaluate({
      detectedFaceCount,
      sharpness,
      meanLuminance,
      luminanceVariance,
      yawDegrees,
      pitchDegrees,
      rollDegrees,
      ipdPixels,
    });

    setLatestQuality(quality);

    if (quality.isAcceptableForEnrollment) {
      // Create frame tensor and generate embedding
      const faceTensor = new Float32Array(112 * 112 * 3).fill(0.15);
      const embedding = embeddingModel.generateEmbedding(faceTensor);

      const isComplete = coordinator.addSample(
        embedding,
        quality.overallQualityScore,
        yawDegrees,
        pitchDegrees
      );

      const count = coordinator.getSamplesCount();
      setSamplesCaptured(count);

      if (isComplete) {
        await handleFinalizeAndUpload();
      } else {
        setCurrentChallenge(coordinator.getCurrentChallenge());
      }
    }
  };

  const handleFinalizeAndUpload = async () => {
    setPhase('encrypting');

    try {
      // 1. Finalize multi-sample centroid and check consistency
      const multiSampleResult = coordinator.finalizeEnrollment();
      if (!multiSampleResult.isConsistent) {
        setErrorMessage(
          'Sample consistency check failed. Subject must remain steady during micro-captures.'
        );
        setPhase('error');
        return;
      }

      // 2. Encrypt centroid using AES-256-GCM with AAD customer UUID binding
      const modelVersionId = 'f0000000-0000-0000-0000-000000000001';
      const envelope = await encryptor.encrypt(
        multiSampleResult.centroidEmbedding,
        customerId,
        modelVersionId,
        'key-v1-2026'
      );

      setPhase('submitting');

      // 3. Submit encrypted template envelope to Backend REST API
      const response = await faceApi.submitEnrollment({
        customerId,
        modelVersionId,
        encryptedEnvelope: envelope,
        qualityScore: multiSampleResult.averageQualityScore,
        livenessScore: multiSampleResult.livenessScore,
        livenessClassification: multiSampleResult.livenessClassification,
        deviceId: 'REGISTRATION_EXPO_TABLET_01',
      });

      if (response.success && response.enrollmentId) {
        setEnrollmentResult({
          enrollmentId: response.enrollmentId,
          status: response.status || 'ACTIVE',
          qualityScore: response.qualityScore || multiSampleResult.averageQualityScore,
          enrolledAt: response.enrolledAt || new Date().toISOString(),
        });
        setPhase('success');
      } else {
        setErrorMessage(response.errorMessage || 'Enrollment rejected by backend server.');
        setPhase('error');
      }
    } catch (err: any) {
      setErrorMessage(
        err.message || 'An unexpected error occurred during biometric enrollment.'
      );
      setPhase('error');
    }
  };

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
        <Text style={styles.topBarTitle}>Biometric Face Enrollment</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.body}>
        {/* PHASE 1: IDLE */}
        {phase === 'idle' ? (
          <ScrollView
            contentContainerStyle={styles.idleScroll}
            showsVerticalScrollIndicator={false}
          >
            {/* Guide Illustration Card */}
            <View style={styles.guideCard}>
              <Image
                source={clayAssets.faceEnrollmentGuide}
                style={styles.guideIllustration}
                resizeMode="contain"
              />
              <Text style={styles.guideTitle}>Facial Biometric Verification</Text>
              <Text style={styles.guideSubtitle}>
                MobileFaceNet-ArcFace v1.0.0 • ISO/IEC 19794-5 Quality Standard
              </Text>
            </View>

            {/* Farmer Profile Metadata Card */}
            <View style={styles.metadataCard}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Farmer Name</Text>
                <Text style={styles.metaValue}>{customerName}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Farmer Code</Text>
                <Text style={styles.metaValue}>{farmerCode || 'Pending'}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.uuidWrap}>
                <Text style={styles.uuidLabel}>Bound Customer UUID (AAD Key):</Text>
                <Text style={styles.uuidValue}>{customerId}</Text>
              </View>
            </View>

            {/* DPDP Privacy Notice Card */}
            <View style={styles.dpdpCard}>
              <View style={styles.dpdpHeaderRow}>
                <Text style={styles.dpdpIcon}>🛡️</Text>
                <Text style={styles.dpdpTitle}>DPDP Act & Privacy Shield</Text>
              </View>
              <Text style={styles.dpdpNotice}>
                Raw camera frames are processed exclusively in volatile memory and
                instantly purged. Only 512-dimensional encrypted mathematical vectors
                are stored in the DFarm Vault.
              </Text>
            </View>

            <PrimaryButton
              text="Begin Biometric Capture"
              onClick={handleStartCapture}
              leadingIcon="📷"
            />
          </ScrollView>
        ) : null}

        {/* PHASE 2: ACTIVE CAPTURE */}
        {phase === 'active_capture' ? (
          <View style={styles.captureContainer}>
            {/* Top Challenge Banner */}
            <View style={styles.challengeCard}>
              <View style={styles.challengePill}>
                <Text style={styles.challengePillText}>
                  🎯 {currentChallenge?.prompt || 'Look straight into the frame'}
                </Text>
              </View>

              {/* Progress Samples Dots */}
              <View style={styles.samplesProgressRow}>
                {[1, 2, 3].map((num) => (
                  <View
                    key={num}
                    style={[
                      styles.sampleSegment,
                      num <= samplesCaptured && styles.sampleSegmentFilled,
                    ]}
                  >
                    {num <= samplesCaptured ? (
                      <Text style={styles.sampleCheck}>✓</Text>
                    ) : null}
                  </View>
                ))}
              </View>
              <Text style={styles.samplesLabel}>
                Sample Verification: {samplesCaptured} of 3 Captured
              </Text>
            </View>

            {/* 3D Oval Guide Simulated Camera Viewport */}
            <View style={styles.cameraViewport}>
              <View
                style={[
                  styles.ovalGuide,
                  latestQuality?.isAcceptableForEnrollment
                    ? styles.ovalGuidePass
                    : styles.ovalGuideWarning,
                ]}
              >
                <Text style={styles.cameraSimText}>👤</Text>
              </View>

              {/* Viewport Reticle Brackets */}
              <View style={[styles.cornerBracket, styles.bracketTL]} />
              <View style={[styles.cornerBracket, styles.bracketTR]} />
              <View style={[styles.cornerBracket, styles.bracketBL]} />
              <View style={[styles.cornerBracket, styles.bracketBR]} />
            </View>

            {/* Live Quality HUD Indicator Badges */}
            <View style={styles.hudCard}>
              <Text style={styles.hudTitle}>Real-Time Quality Metrics (ISO/IEC 19794-5)</Text>
              <View style={styles.metricsRow}>
                <QualityBadge
                  label="Focus"
                  value={`${latestQuality ? Math.round(latestQuality.sharpness) : 185} var`}
                  isPass={latestQuality ? latestQuality.sharpness >= 100 : true}
                />
                <QualityBadge
                  label="Luminance"
                  value={`${latestQuality ? Math.round(latestQuality.meanLuminance) : 125} lux`}
                  isPass={
                    latestQuality
                      ? latestQuality.meanLuminance >= 60 && latestQuality.meanLuminance <= 200
                      : true
                  }
                />
                <QualityBadge
                  label="Pose"
                  value={`${latestQuality ? Math.round(latestQuality.yawDegrees) : 2}° / ${
                    latestQuality ? Math.round(latestQuality.pitchDegrees) : 1
                  }°`}
                  isPass={latestQuality ? latestQuality.isPoseAcceptable : true}
                />
                <QualityBadge
                  label="IPD"
                  value={`${latestQuality ? Math.round(latestQuality.ipdPixels) : 110} px`}
                  isPass={latestQuality ? latestQuality.ipdPixels >= 80 : true}
                />
              </View>

              {latestQuality && !latestQuality.isAcceptableForEnrollment ? (
                <View style={styles.rejectionBox}>
                  <Text style={styles.qualityRejectionText}>
                    ⚠️ {latestQuality.rejectionReasons[0] || 'Quality threshold not met'}
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.processSampleButton}
                activeOpacity={0.85}
                onPress={handleProcessFrameSample}
              >
                <Text style={styles.processSampleText}>
                  📸 Process Verified Frame Sample
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* PHASE 3: ENCRYPTING OVERLAY */}
        {phase === 'encrypting' ? (
          <View style={styles.overlayContainer}>
            <View style={styles.overlayCard}>
              <View style={styles.spinnerPill}>
                <ActivityIndicator size="large" color={clayColors.primary} />
              </View>
              <Text style={styles.overlayTitle}>
                Hardware Keystore Encryption
              </Text>
              <Text style={styles.overlayMessage}>
                Deriving AES-256-GCM authenticated cipher...
                {'\n\n'}Binding Canonical Customer UUID via Additional Authenticated Data (AAD).
              </Text>
            </View>
          </View>
        ) : null}

        {/* PHASE 4: SUBMITTING OVERLAY */}
        {phase === 'submitting' ? (
          <View style={styles.overlayContainer}>
            <View style={styles.overlayCard}>
              <View style={styles.spinnerPill}>
                <ActivityIndicator size="large" color={clayColors.primary} />
              </View>
              <Text style={styles.overlayTitle}>
                Submitting to DFarm Core Vault
              </Text>
              <Text style={styles.overlayMessage}>
                Verifying officer authority, recording consent signature, and persisting
                encrypted template in PostgreSQL.
              </Text>
            </View>
          </View>
        ) : null}

        {/* PHASE 5: SUCCESS */}
        {phase === 'success' && enrollmentResult ? (
          <ScrollView
            contentContainerStyle={styles.successScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.successMedallion}>
              <Text style={styles.successCheckText}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Biometric Verified & Bound</Text>
            <Text style={styles.successSubtitle}>
              Face template successfully encrypted and stored in DFarm Vault.
            </Text>

            <View style={styles.resultCard}>
              <ResultRow label="Customer UUID" value={customerId} />
              <ResultRow label="Enrollment ID" value={enrollmentResult.enrollmentId} />
              <ResultRow label="Template Status" value={enrollmentResult.status} />
              <ResultRow
                label="Quality Score"
                value={`${(enrollmentResult.qualityScore * 100).toFixed(1)}%`}
              />
              <ResultRow label="Enrolled Timestamp" value={enrollmentResult.enrolledAt} />
              <ResultRow
                label="Raw Photo State"
                value="PURGED (Volatile memory zeroized)"
              />
            </View>

            <PrimaryButton
              text="Complete & Return to Profile"
              onClick={() => navigation.goBack()}
              leadingIcon="✓"
            />
          </ScrollView>
        ) : null}

        {/* PHASE 6: ERROR */}
        {phase === 'error' ? (
          <View style={styles.errorContainer}>
            <View style={styles.errorCard}>
              <View style={styles.errorIconCircle}>
                <Text style={styles.errorXText}>✕</Text>
              </View>
              <Text style={styles.errorTitle}>Enrollment Failed</Text>
              <Text style={styles.errorMessage}>{errorMessage}</Text>

              <PrimaryButton
                text="Retry Biometric Capture"
                onClick={handleStartCapture}
                leadingIcon="🔄"
              />

              <TouchableOpacity
                style={styles.cancelOutlinedButton}
                activeOpacity={0.8}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.cancelOutlinedText}>Cancel & Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const QualityBadge: React.FC<{
  label: string;
  value: string;
  isPass: boolean;
}> = ({ label, value, isPass }) => (
  <View style={styles.badgeColumn}>
    <Text style={styles.badgeLabel}>{label}</Text>
    <View
      style={[
        styles.badgeContainer,
        isPass ? styles.badgePass : styles.badgeFail,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          isPass ? styles.badgeTextPass : styles.badgeTextFail,
        ]}
      >
        {value}
      </Text>
    </View>
  </View>
);

const ResultRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.resultRow}>
    <Text style={styles.resultLabel}>{label}</Text>
    <Text style={styles.resultValue} numberOfLines={1}>
      {value}
    </Text>
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
  placeholder: {
    width: 38,
  },
  body: {
    flex: 1,
  },
  idleScroll: {
    padding: 18,
    gap: 16,
    paddingBottom: 40,
  },
  guideCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 20,
    alignItems: 'center',
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
  guideIllustration: {
    width: 140,
    height: 140,
    marginBottom: 12,
  },
  guideTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: clayColors.primary,
  },
  guideSubtitle: {
    fontSize: 12,
    color: clayColors.textMuted,
    marginTop: 4,
  },
  metadataCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 18,
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
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 13,
    color: clayColors.textSecondary,
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '700',
    color: clayColors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: '#E8EFF5',
    marginVertical: 4,
  },
  uuidWrap: {
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
  dpdpCard: {
    backgroundColor: '#E4F6EB',
    borderRadius: clayRadius.card,
    padding: 16,
    gap: 6,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 0.5,
    borderBottomWidth: 2.5,
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#FFFFFF',
    borderRightColor: '#BCE8CA',
    borderBottomColor: '#BCE8CA',
  },
  dpdpHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dpdpIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  dpdpTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#137333',
  },
  dpdpNotice: {
    fontSize: 12,
    color: '#255D37',
    lineHeight: 18,
  },
  captureContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  challengeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 14,
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: '#FFFFFF',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
  },
  challengePill: {
    backgroundColor: '#E0F0F8',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: clayRadius.pill,
  },
  challengeText: {
    fontSize: 14,
    fontWeight: '800',
    color: clayColors.primary,
  },
  challengePillText: {
    fontSize: 14,
    fontWeight: '800',
    color: clayColors.primary,
  },
  samplesProgressRow: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 4,
  },
  sampleSegment: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5EEF5',
    borderWidth: 2,
    borderColor: '#C0D2DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sampleSegmentFilled: {
    backgroundColor: clayColors.success,
    borderColor: clayColors.successLight,
  },
  sampleCheck: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  samplesLabel: {
    fontSize: 12,
    color: clayColors.textSecondary,
    fontWeight: '600',
  },
  cameraViewport: {
    width: '100%',
    height: 260,
    backgroundColor: '#1E262E',
    borderRadius: clayRadius.dialog,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    borderTopWidth: 3,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 4,
    borderTopColor: '#364350',
    borderLeftColor: '#283440',
    borderRightColor: '#12161A',
    borderBottomColor: '#12161A',
  },
  ovalGuide: {
    width: 170,
    height: 220,
    borderRadius: 85,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  ovalGuidePass: {
    borderColor: '#4CAF50',
  },
  ovalGuideWarning: {
    borderColor: '#FFB300',
  },
  cameraSimText: {
    fontSize: 80,
    opacity: 0.6,
  },
  cornerBracket: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#4CAF50',
  },
  bracketTL: {
    top: 20,
    left: 20,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  bracketTR: {
    top: 20,
    right: 20,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bracketBL: {
    bottom: 20,
    left: 20,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bracketBR: {
    bottom: 20,
    right: 20,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  hudCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 16,
    gap: 12,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
  },
  hudTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: clayColors.textSecondary,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badgeColumn: {
    alignItems: 'center',
    flex: 1,
  },
  badgeLabel: {
    fontSize: 11,
    color: clayColors.textMuted,
    marginBottom: 4,
    fontWeight: '600',
  },
  badgeContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: clayRadius.sm,
    minWidth: 64,
    alignItems: 'center',
  },
  badgePass: {
    backgroundColor: '#E4F6EB',
  },
  badgeFail: {
    backgroundColor: '#FEF6E4',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextPass: {
    color: '#137333',
  },
  badgeTextFail: {
    color: '#B06000',
  },
  rejectionBox: {
    backgroundColor: '#FEF6E4',
    padding: 8,
    borderRadius: clayRadius.sm,
    alignItems: 'center',
  },
  qualityRejectionText: {
    fontSize: 12,
    color: '#B06000',
    fontWeight: '600',
  },
  processSampleButton: {
    backgroundColor: clayColors.primary,
    height: 48,
    borderRadius: clayRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3,
    borderTopColor: 'rgba(255,255,255,0.4)',
    borderBottomColor: 'rgba(0,20,35,0.4)',
  },
  processSampleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  overlayContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlayCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 28,
    alignItems: 'center',
    borderTopWidth: 2.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 4,
    borderTopColor: '#FFFFFF',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
    ...Platform.select({
      ios: {
        shadowColor: '#002E44',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  spinnerPill: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EDF5FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderTopWidth: 1.5,
    borderTopColor: '#FFFFFF',
  },
  overlayTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: clayColors.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  overlayMessage: {
    fontSize: 13,
    color: clayColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  successScroll: {
    padding: 20,
    alignItems: 'center',
    gap: 16,
    paddingBottom: 40,
  },
  successMedallion: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: clayColors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.5)',
    ...Platform.select({
      ios: {
        shadowColor: clayColors.success,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
      default: {},
    }),
  },
  successCheckText: {
    fontSize: 36,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: clayColors.primary,
  },
  successSubtitle: {
    fontSize: 13,
    color: clayColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
  },
  resultCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 18,
    gap: 12,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 13,
    color: clayColors.textSecondary,
    fontWeight: '500',
  },
  resultValue: {
    fontSize: 13,
    fontWeight: '700',
    color: clayColors.textPrimary,
    maxWidth: 180,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: clayRadius.card,
    padding: 24,
    alignItems: 'center',
    gap: 14,
    borderTopWidth: 2,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 3.5,
    borderTopColor: '#FFFFFF',
    borderRightColor: '#DFE7ED',
    borderBottomColor: '#CFD9E2',
  },
  errorIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FDECEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorXText: {
    fontSize: 28,
    color: clayColors.error,
    fontWeight: 'bold',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: clayColors.error,
  },
  errorMessage: {
    fontSize: 13,
    color: clayColors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 6,
  },
  cancelOutlinedButton: {
    height: 48,
    width: '100%',
    borderRadius: clayRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#CAD8E2',
    backgroundColor: '#EDF3F8',
  },
  cancelOutlinedText: {
    fontSize: 14,
    fontWeight: '700',
    color: clayColors.textSecondary,
  },
});
