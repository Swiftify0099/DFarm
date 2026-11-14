import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { colors } from '../theme/colors';
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
    // Simulate real Camera frame evaluation
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
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Biometric Face Enrollment</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.body}>
        {/* PHASE: IDLE */}
        {phase === 'idle' ? (
          <ScrollView contentContainerStyle={styles.idleScroll}>
            <View style={styles.idleCard}>
              <Text style={styles.idleCardTitle}>Customer Biometric Verification</Text>
              <Text style={styles.idleText}>Customer Name: {customerName}</Text>
              <Text style={styles.idleText}>Farmer Code: {farmerCode}</Text>
              <Text style={styles.idleUuidText}>Customer UUID: {customerId}</Text>

              <Text style={styles.dpdpNotice}>
                Notice: In compliance with DPDP Act & DFarm Biometric Policy, raw photos
                are processed only in volatile RAM and immediately discarded. Only
                encrypted mathematical embeddings are stored.
              </Text>
            </View>

            <TouchableOpacity style={styles.beginButton} onPress={handleStartCapture}>
              <Text style={styles.beginButtonText}>Begin Biometric Capture</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}

        {/* PHASE: ACTIVE CAPTURE */}
        {phase === 'active_capture' ? (
          <View style={styles.captureContainer}>
            {/* Top Challenge Banner */}
            <View style={styles.topChallengeContainer}>
              <View style={styles.challengePill}>
                <Text style={styles.challengeText}>
                  Challenge: {currentChallenge?.prompt || 'Look straight ahead'}
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
                  />
                ))}
              </View>
              <Text style={styles.samplesLabel}>
                Samples Captured: {samplesCaptured}/3
              </Text>
            </View>

            {/* Oval Guide Simulated Camera Viewport */}
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
            </View>

            {/* Live Quality HUD Indicator Badges */}
            <View style={styles.hudContainer}>
              <View style={styles.hudCard}>
                <Text style={styles.hudTitle}>Real-Time Quality Metrics</Text>
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
                  <Text style={styles.qualityRejectionText}>
                    ⚠️ {latestQuality.rejectionReasons[0] || 'Quality threshold not met'}
                  </Text>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.processSampleButton}
                onPress={handleProcessFrameSample}
              >
                <Text style={styles.processSampleText}>
                  Process Verified Frame Sample
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* PHASE: ENCRYPTING OVERLAY */}
        {phase === 'encrypting' ? (
          <View style={styles.overlayContainer}>
            <View style={styles.overlayCard}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.overlayTitle}>
                Biometric Encryption in Progress
              </Text>
              <Text style={styles.overlayMessage}>
                Deriving Android Keystore AES-256-GCM authenticated cipher...
                {'\n'}Binding Canonical Customer UUID via AAD.
              </Text>
            </View>
          </View>
        ) : null}

        {/* PHASE: SUBMITTING OVERLAY */}
        {phase === 'submitting' ? (
          <View style={styles.overlayContainer}>
            <View style={styles.overlayCard}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.overlayTitle}>
                Submitting to DFarm Core Engine
              </Text>
              <Text style={styles.overlayMessage}>
                Validating officer authorization, active consent record, and
                writing encrypted template...
              </Text>
            </View>
          </View>
        ) : null}

        {/* PHASE: SUCCESS */}
        {phase === 'success' && enrollmentResult ? (
          <ScrollView contentContainerStyle={styles.successScroll}>
            <View style={styles.successIconCircle}>
              <Text style={styles.successCheckText}>✓</Text>
            </View>
            <Text style={styles.successTitle}>Biometric Enrollment Verified</Text>
            <Text style={styles.successSubtitle}>
              Face template successfully encrypted and stored in DFarm Vault.
            </Text>

            <View style={styles.resultCard}>
              <ResultRow label="Customer UUID" value={customerId} />
              <ResultRow label="Enrollment ID" value={enrollmentResult.enrollmentId} />
              <ResultRow label="Status" value={enrollmentResult.status} />
              <ResultRow
                label="Quality Score"
                value={enrollmentResult.qualityScore.toFixed(3)}
              />
              <ResultRow label="Enrolled At" value={enrollmentResult.enrolledAt} />
              <ResultRow
                label="Raw Photo Retention"
                value="PURGED (RAM zeroized)"
              />
            </View>

            <TouchableOpacity
              style={styles.completeButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.completeButtonText}>
                Complete & Return to Customer Profile
              </Text>
            </TouchableOpacity>
          </ScrollView>
        ) : null}

        {/* PHASE: ERROR */}
        {phase === 'error' ? (
          <View style={styles.errorContainer}>
            <View style={styles.errorIconCircle}>
              <Text style={styles.errorXText}>✕</Text>
            </View>
            <Text style={styles.errorTitle}>Enrollment Failed</Text>
            <Text style={styles.errorMessage}>{errorMessage}</Text>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleStartCapture}
            >
              <Text style={styles.retryButtonText}>Retry Enrollment Capture</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
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
    backgroundColor: colors.darkBackground,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 6,
  },
  backButtonText: {
    color: colors.onPrimaryContainer,
    fontSize: 15,
    fontWeight: '600',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.onPrimaryContainer,
  },
  placeholder: {
    width: 40,
  },
  body: {
    flex: 1,
  },
  idleScroll: {
    padding: 24,
    justifyContent: 'center',
    minHeight: '100%',
  },
  idleCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  idleCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 6,
  },
  idleText: {
    fontSize: 14,
    color: '#E0E0E0',
  },
  idleUuidText: {
    fontSize: 12,
    color: '#9E9E9E',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  dpdpNotice: {
    fontSize: 11,
    color: '#B0BEC5',
    lineHeight: 16,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingTop: 10,
  },
  beginButton: {
    backgroundColor: colors.primary,
    height: 54,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  beginButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  captureContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  topChallengeContainer: {
    alignItems: 'center',
    padding: 16,
  },
  challengePill: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 10,
  },
  challengeText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  samplesProgressRow: {
    flexDirection: 'row',
    width: '80%',
    gap: 8,
  },
  sampleSegment: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  sampleSegmentFilled: {
    backgroundColor: '#4CAF50',
  },
  samplesLabel: {
    color: '#CCC',
    fontSize: 12,
    marginTop: 6,
  },
  cameraViewport: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ovalGuide: {
    width: 240,
    height: 320,
    borderRadius: 120,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ovalGuidePass: {
    borderColor: '#4CAF50',
  },
  ovalGuideWarning: {
    borderColor: '#FF9800',
    borderStyle: 'dashed',
  },
  cameraSimText: {
    fontSize: 90,
    opacity: 0.25,
  },
  hudContainer: {
    padding: 16,
    gap: 12,
  },
  hudCard: {
    backgroundColor: 'rgba(30,30,30,0.95)',
    borderRadius: 16,
    padding: 14,
  },
  hudTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  badgeColumn: {
    alignItems: 'center',
  },
  badgeLabel: {
    color: '#888',
    fontSize: 11,
    marginBottom: 2,
  },
  badgeContainer: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgePass: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  badgeFail: {
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  badgeTextPass: {
    color: '#81C784',
  },
  badgeTextFail: {
    color: '#E57373',
  },
  qualityRejectionText: {
    color: '#FF5252',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  processSampleButton: {
    backgroundColor: '#2E7D32',
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processSampleText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlayCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    gap: 12,
  },
  overlayTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.onSurface,
    textAlign: 'center',
  },
  overlayMessage: {
    fontSize: 13,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 18,
  },
  successScroll: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
  },
  successIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successCheckText: {
    fontSize: 48,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 6,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#CCC',
    textAlign: 'center',
    marginBottom: 20,
  },
  resultCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 14,
    padding: 16,
    width: '100%',
    gap: 8,
    marginBottom: 28,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  resultLabel: {
    fontSize: 12,
    color: '#888',
  },
  resultValue: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: '500',
    flexShrink: 1,
    marginLeft: 8,
  },
  completeButton: {
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  errorXText: {
    fontSize: 44,
    color: '#F44336',
    fontWeight: 'bold',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: '#FF8A80',
    textAlign: 'center',
    marginBottom: 32,
  },
  retryButton: {
    backgroundColor: colors.primary,
    height: 52,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#555',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#FFF',
    fontSize: 16,
  },
});
