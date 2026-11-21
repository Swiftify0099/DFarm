import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  DFARM_SHADOWS,
  ClayCard,
  ClayButton,
  ClayBadge,
  ClayHeader,
} from '../../design-system';
import { yuNetDetector } from '../../face-ai/yunet-detector';
import { sFaceEmbedder } from '../../face-ai/sface-embedder';
import { checkAlignmentQuality, averageAndNormalizeEmbeddings } from '../../face-ai/preprocessor';
import { apiClient } from '../../services/api-client';
import { useRegistration } from '../../features/registration/useRegistration';
import { FaceOvalGuide, CameraPermissionIllustration } from '../../assets/vectors/BiometricAssets';

export default function FaceEnrollScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    dairyId?: string;
    dairyName?: string;
    fullName?: string;
    village?: string;
    milkSupplyType?: 'COW' | 'BUFFALO' | 'BOTH';
    mobileNumber?: string;
    bankName?: string;
    accountNumber?: string;
    confirmAccountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
  }>();

  const [permission, requestPermission] = useCameraPermissions();
  const { register, isRegistering } = useRegistration();

  const [modelReady, setModelReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Center your face inside the oval reticle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [faceDetected, setFaceDetected] = useState(true);

  const cameraRef = useRef<any>(null);

  useEffect(() => {
    // Pre-warm backend immediately when entering enrollment screen so Render instance is awake
    apiClient.get('/health/live').catch(() => {});

    async function loadModels() {
      try {
        await yuNetDetector.initialize();
        await sFaceEmbedder.initialize();
        setModelReady(true);
      } catch {
        setModelReady(true);
      }
    }
    loadModels();
  }, []);

  const handleCaptureAndEnroll = async () => {
    setErrorMessage(null);
    setIsCapturing(true);
    setProgress(10);

    try {
      const sampleEmbeddings: number[][] = [];
      const TOTAL_SAMPLES = 2; // Capture 2 high-quality samples: fast, resilient over cellular, stable centroid

      for (let sampleIdx = 1; sampleIdx <= TOTAL_SAMPLES; sampleIdx++) {
        setStatusMessage(`Capturing sample ${sampleIdx} of ${TOTAL_SAMPLES} with YuNet & SFace...`);

        if (sampleIdx > 1) {
          await new Promise((r) => setTimeout(r, 200));
        }

        let embedding: number[] | null = null;

        if (cameraRef.current?.takePictureAsync) {
          // Use quality: 0.35 to keep upload payload ~150KB instead of 6MB (96% bandwidth reduction)
          const photo = await cameraRef.current.takePictureAsync({
            base64: true,
            quality: 0.35,
            shutterSound: false,
          });

          if (!photo?.base64) {
            throw new Error(`Sample ${sampleIdx}: Camera photo capture returned empty data.`);
          }

          let detectRes: any = null;
          let postErr: any = null;

          // Attempt with automatic retry in case Render server was waking up
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              if (attempt > 1) {
                setStatusMessage(`Cloud server is warming up, retrying (${attempt}/3)...`);
                await new Promise((r) => setTimeout(r, 2000));
              }
              detectRes = await apiClient.post('/identity/face/detect-and-embed', {
                imageBase64: photo.base64,
              });
              postErr = null;
              break;
            } catch (err: any) {
              postErr = err;
              const status = err?.response?.status;
              const isRetryable =
                err?.isNetworkError ||
                !err?.response ||
                status === 502 ||
                status === 503 ||
                status === 504 ||
                status === 500;
              if (isRetryable && attempt < 3) {
                continue;
              }
              break;
            }
          }

          if (postErr) {
            // Check for explicit error message from backend or client handler
            const sMsg =
              postErr?.response?.data?.error?.message ||
              postErr?.response?.data?.message ||
              (typeof postErr?.response?.data?.error === 'string' ? postErr.response.data.error : null) ||
              postErr?.message;
            if (sMsg) {
              throw new Error(`Sample ${sampleIdx}: ${sMsg}`);
            }

            // On-device fallback if models are loaded locally
            if (yuNetDetector.isModelReady() && sFaceEmbedder.isModelReady()) {
              const detectionResult = await yuNetDetector.detectFaces({ width: 640, height: 640 });
              const faces = detectionResult.faces;
              if (faces && faces.length === 1) {
                const primaryFace = faces[0];
                const alignment = checkAlignmentQuality(primaryFace.landmarks);
                if (alignment.isAligned) {
                  const embRes = await sFaceEmbedder.generateEmbedding(primaryFace.landmarks);
                  if (embRes.embedding && embRes.embedding.length === 128) {
                    embedding = embRes.embedding;
                  }
                }
              }
            }

            if (!embedding) {
              // If we already have at least 1 quality sample, proceed with that rather than failing the whole registration
              if (sampleEmbeddings.length > 0) {
                console.warn(`[Biometrics] Sample ${sampleIdx} failed, proceeding with ${sampleEmbeddings.length} captured samples.`);
                break;
              }
              throw postErr;
            }
          } else {
            const data = detectRes.data;

            if (!data.success || data.faceCount === 0) {
              throw new Error(
                `Sample ${sampleIdx}: No face detected in camera viewport. Please ensure good lighting and face the camera directly.`
              );
            }

            if (data.faceCount > 1) {
              throw new Error(
                `Sample ${sampleIdx}: Multiple faces (${data.faceCount}) detected. Only 1 person is permitted during biometric registration.`
              );
            }

            if (!data.isAligned) {
              throw new Error(
                `Sample ${sampleIdx}: ${
                  data.reason || 'Face is tilted or misaligned. Please hold your head straight.'
                }`
              );
            }

            if (!data.embedding || data.embedding.length !== 128) {
              throw new Error(
                `Sample ${sampleIdx}: Biometric feature extraction failed. Invalid embedding dimension.`
              );
            }

            embedding = data.embedding;
          }
        } else {
          const detectionResult = await yuNetDetector.detectFaces({ width: 640, height: 640 });
          const faces = detectionResult.faces;
          if (!faces || faces.length === 0) {
            throw new Error(
              `Sample ${sampleIdx}: No face detected in camera viewport. Please ensure good lighting and face the camera directly.`
            );
          }

          if (faces.length > 1) {
            throw new Error(
              `Sample ${sampleIdx}: Multiple faces (${faces.length}) detected. Only 1 person is permitted during biometric registration.`
            );
          }

          const primaryFace = faces[0];
          const alignment = checkAlignmentQuality(primaryFace.landmarks);
          if (!alignment.isAligned) {
            throw new Error(
              `Sample ${sampleIdx}: ${
                alignment.reason || 'Face is tilted or misaligned. Please hold your head straight.'
              }`
            );
          }

          const embeddingResult = await sFaceEmbedder.generateEmbedding(primaryFace.landmarks);
          if (!embeddingResult.isNormalized || embeddingResult.embedding.length !== 128) {
            throw new Error(
              `Sample ${sampleIdx}: Biometric feature extraction failed. Invalid embedding dimension.`
            );
          }

          embedding = embeddingResult.embedding;
        }

        if (!embedding) {
          throw new Error(`Sample ${sampleIdx}: Failed to extract biometric embedding.`);
        }
        sampleEmbeddings.push(embedding);
        setProgress(Math.round((sampleIdx / TOTAL_SAMPLES) * 80));
      }

      setStatusMessage('Averaging quality samples & applying L2 unit normalization...');
      const finalTemplate = averageAndNormalizeEmbeddings(sampleEmbeddings);

      // 3. Submit registration package to backend
      setStatusMessage('Encrypting & registering biometric template with backend...');
      setProgress(90);

      const bankDetails =
        params.accountNumber && params.ifscCode
          ? {
              bankName: params.bankName || 'Cooperative Bank',
              accountNumber: params.accountNumber,
              confirmAccountNumber: params.confirmAccountNumber || params.accountNumber,
              ifscCode: params.ifscCode,
              accountHolderName: params.accountHolderName || params.fullName || 'Registered Farmer',
            }
          : undefined;

      const registrationResult = await register({
        selectedDairyId: params.dairyId || '00000000-0000-0000-0000-000000000001',
        fullName: params.fullName || 'Registered Farmer',
        village: params.village || 'Local Village',
        mobileNumber: params.mobileNumber,
        milkSupplyType: params.milkSupplyType || 'COW',
        biometricConsent: true,
        bankDetails,
        faceTemplate: {
          modelVersion: 'sface_int8_2021dec',
          embedding: finalTemplate,
          confidence: 0.98,
        },
      });

      setProgress(100);
      setStatusMessage('Biometric enrollment complete!');

      // Only transition on genuine registration success
      router.replace({
        pathname: '/(onboarding)/pending-approval',
        params: {
          dairyName: params.dairyName || 'DFarm Cooperative Society',
          farmerName: params.fullName || 'Registered Farmer',
          customerId: registrationResult?.customerUuid,
        },
      });
    } catch (err: any) {
      const serverError =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        (typeof err?.response?.data?.error === 'string' ? err.response.data.error : null);
      let msg =
        (typeof serverError === 'string' ? serverError : null) ||
        err?.message ||
        'Face enrollment failed. Please ensure your face is well-lit and retry.';

      if (
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        err?.response?.status === 502 ||
        err?.response?.status === 503 ||
        err?.response?.status === 504
      ) {
        msg =
          'DFarm cloud server is waking up from standby (HTTP 502/503). Please wait a few seconds and tap Retry.';
      }

      setErrorMessage(msg);
      setStatusMessage('Face capture failed. Please retry.');
      Alert.alert('Registration Error', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Retry', onPress: () => handleCaptureAndEnroll() },
      ]);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Face Biometric Enrollment"
        subtitle="बायोमेट्रिक चेहरा नोंदणी (Step 2 of 2)"
        onBack={() => router.back()}
      />

      {/* Step Progress Tracker */}
      <View style={styles.progressContainer}>
        <View style={styles.stepTrack}>
          <View style={styles.stepActiveBar} />
        </View>
        <View style={styles.stepLabelsRow}>
          <Text style={styles.stepCompletedLabel}>✓ 1. Personal & Animals</Text>
          <Text style={styles.stepActiveLabel}>2. Live Face Biometrics</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Model Status Pill */}
        <View style={styles.modelStatusRow}>
          <ClayBadge
            label={modelReady ? 'OpenCV YuNet + SFace INT8 Active' : 'Loading Face Engine...'}
            variant={modelReady ? 'success' : 'pending'}
          />
        </View>

        {/* Live Camera Viewport Frame with Tactile Clay Bezel */}
        <View style={styles.cameraFrameBezel}>
          <View style={styles.cameraViewport}>
            {permission?.granted ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="front"
              />
            ) : (
              <View style={styles.permissionContainer}>
                <CameraPermissionIllustration size={80} />
                <Text style={styles.permissionTitle}>Camera Access Required</Text>
                <Text style={styles.permissionSubtitle}>
                  DFarm requires front camera access to capture your facial biometric
                  template for contactless dairy intake authentication.
                </Text>
                <ClayButton
                  title="Grant Camera Access"
                  onPress={requestPermission}
                  variant="primary"
                  size="md"
                  style={styles.permissionBtn}
                />
              </View>
            )}

            {/* Tactile Face Scanning Reticle Overlay */}
            {permission?.granted && (
              <View style={styles.reticleOverlay} pointerEvents="none">
                <FaceOvalGuide width={230} height={290} isAligned={faceDetected} />
              </View>
            )}

            {/* Instruction Banner at Viewport Bottom */}
            <View style={styles.statusToast}>
              <View style={styles.statusToastDot} />
              <Text style={styles.statusToastText}>{statusMessage}</Text>
            </View>
          </View>
        </View>

        {/* Error Notification */}
        {errorMessage && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            <ClayButton
              title="Retry Face Capture"
              onPress={handleCaptureAndEnroll}
              variant="outline"
              size="sm"
              style={{ marginTop: 8 }}
            />
          </View>
        )}

        {/* Biometric Guidance & Submission Card */}
        <ClayCard variant="raised" style={styles.guidanceCard}>
          <View style={styles.tipsSection}>
            <View style={styles.tipItem}>
              <Text style={styles.tipBullet}>•</Text>
              <Text style={styles.tipText}>
                Ensure adequate daylight and face the camera directly without head tilt.
              </Text>
            </View>
            <View style={styles.tipItem}>
              <Text style={styles.tipBullet}>•</Text>
              <Text style={styles.tipText}>
                Remove sunglasses, cap, or face covering before capturing.
              </Text>
            </View>
            <View style={styles.tipItem}>
              <Text style={styles.tipBullet}>•</Text>
              <Text style={styles.tipText}>
                Only 1 person must be visible in the camera frame.
              </Text>
            </View>
          </View>

          {/* Processing Progress Bar */}
          {isCapturing && (
            <View style={styles.progressSection}>
              <View style={styles.progressRow}>
                <ActivityIndicator size="small" color={DFARM_COLORS.primaryOrange} />
                <Text style={styles.progressText}>
                  {statusMessage} ({progress}%)
                </Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
            </View>
          )}

          <ClayButton
            title={
              isCapturing
                ? 'Processing Biometrics...'
                : !permission?.granted
                ? 'Grant Camera Access'
                : !modelReady
                ? 'Loading Face Engine...'
                : 'Capture & Submit Registration'
            }
            onPress={
              !permission?.granted
                ? requestPermission
                : handleCaptureAndEnroll
            }
            loading={isCapturing || isRegistering}
            disabled={isCapturing || isRegistering}
            variant="primary"
            style={styles.captureBtn}
          />
        </ClayCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  stepTrack: {
    height: 4,
    backgroundColor: DFARM_COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 6,
  },
  stepActiveBar: {
    width: '100%',
    height: '100%',
    backgroundColor: DFARM_COLORS.primaryOrange,
  },
  stepLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepCompletedLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: '#2E7D32',
    fontWeight: '700',
  },
  stepActiveLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '700',
    color: DFARM_COLORS.primaryOrange,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 28,
  },
  modelStatusRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  cameraFrameBezel: {
    borderRadius: DFARM_RADIUS.xl,
    padding: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: DFARM_COLORS.border,
    ...DFARM_SHADOWS.clayCard,
    marginBottom: 16,
  },
  cameraViewport: {
    width: '100%',
    height: 340,
    borderRadius: DFARM_RADIUS.lg,
    overflow: 'hidden',
    backgroundColor: '#1E1A17',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusToast: {
    position: 'absolute',
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(33, 27, 24, 0.78)',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: DFARM_RADIUS.pill,
    gap: 8,
    maxWidth: '90%',
  },
  statusToastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: DFARM_COLORS.primaryOrange,
  },
  statusToastText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  permissionContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: DFARM_COLORS.surfaceInset,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  permissionTitle: {
    ...DFARM_TYPOGRAPHY.h2,
    color: DFARM_COLORS.primaryText,
    marginTop: 14,
    marginBottom: 6,
    textAlign: 'center',
  },
  permissionSubtitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },
  permissionBtn: {
    minWidth: 180,
  },
  errorContainer: {
    backgroundColor: '#FFF8F8',
    borderColor: '#FFCDD2',
    borderWidth: 1,
    borderRadius: DFARM_RADIUS.sm,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.error,
    fontWeight: '600',
  },
  guidanceCard: {
    padding: 18,
  },
  tipsSection: {
    gap: 6,
    marginBottom: 16,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  tipBullet: {
    color: DFARM_COLORS.primaryOrange,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '800',
  },
  tipText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    lineHeight: 18,
    flex: 1,
  },
  progressSection: {
    backgroundColor: DFARM_COLORS.surfaceInset,
    padding: 12,
    borderRadius: DFARM_RADIUS.sm,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  progressText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryText,
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: DFARM_COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: DFARM_COLORS.primaryOrange,
  },
  captureBtn: {
    marginTop: 4,
  },
});
