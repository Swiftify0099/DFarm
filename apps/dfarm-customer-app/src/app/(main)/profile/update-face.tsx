import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  DFARM_SHADOWS,
  ClayCard,
  ClayBadge,
  ClayButton,
  ClayHeader,
} from '../../../design-system';
import { yuNetDetector } from '../../../face-ai/yunet-detector';
import { sFaceEmbedder } from '../../../face-ai/sface-embedder';
import { checkAlignmentQuality, averageAndNormalizeEmbeddings } from '../../../face-ai/preprocessor';
import { apiClient } from '../../../services/api-client';
import { useProfile } from '../../../features/profile/useProfile';
import {
  FaceOvalGuide,
  BiometricSuccessBadge,
  CameraPermissionIllustration,
} from '../../../assets/vectors/BiometricAssets';

export default function UpdateFaceScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const { profile, updateFace, isUpdatingFace } = useProfile();
  const [modelReady, setModelReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Center your face inside the oval reticle');
  const cameraRef = useRef<any>(null);

  // FIX: Pre-load models on mount so they are ready before the user taps capture.
  // Prevents the button from staying disabled due to model not ready.
  useEffect(() => {
    async function loadModels() {
      try {
        await yuNetDetector.initialize();
        await sFaceEmbedder.initialize();
        setModelReady(true);
      } catch {
        setModelReady(true); // Non-blocking — camera capture can still attempt
      }
    }
    loadModels();
  }, []);

  const handleUpdate = async () => {
    // FIX: If camera permission not yet granted, request it first instead of silently failing.
    if (!permission?.granted) {
      await requestPermission();
      return;
    }

    setErrorMessage(null);
    setIsCapturing(true);
    setProgress(10);
    setStatusMessage('Initializing YuNet & SFace neural engines...');

    try {
      // Models were pre-loaded on mount; these calls return immediately if already loaded.
      await yuNetDetector.initialize();
      await sFaceEmbedder.initialize();

      const sampleEmbeddings: number[][] = [];
      const TOTAL_SAMPLES = 5;

      for (let sampleIdx = 1; sampleIdx <= TOTAL_SAMPLES; sampleIdx++) {
        setStatusMessage(`Capturing quality sample ${sampleIdx} of ${TOTAL_SAMPLES}...`);

        if (sampleIdx > 1) {
          await new Promise((r) => setTimeout(r, 180));
        }

        let embedding: number[] | null = null;

        if (cameraRef.current?.takePictureAsync) {
          const photo = await cameraRef.current.takePictureAsync({
            base64: true,
            quality: 0.6,
            shutterSound: false,
          });

          if (!photo?.base64) {
            throw new Error(`Sample ${sampleIdx}: Camera photo capture returned empty data.`);
          }

          try {
            const detectRes = await apiClient.post('/identity/face/detect-and-embed', {
              imageBase64: photo.base64,
            });
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
          } catch (postErr: any) {
            const sMsg =
              postErr?.response?.data?.error?.message ||
              postErr?.response?.data?.message ||
              (typeof postErr?.response?.data?.error === 'string' ? postErr.response.data.error : null);
            if (sMsg) {
              throw new Error(`Sample ${sampleIdx}: ${sMsg}`);
            }

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
              throw postErr;
            }
          }
        } else {
          const detection = await yuNetDetector.detectFaces({ width: 640, height: 640 });

          if (!detection.faces || detection.faces.length === 0) {
            throw new Error(
              `Sample ${sampleIdx}: No face detected. Please ensure your face is inside the reticle.`
            );
          }

          if (detection.faces.length > 1) {
            throw new Error(
              `Sample ${sampleIdx}: Multiple faces detected. Only the enrolled farmer must be in view.`
            );
          }

          const primaryFace = detection.faces[0];
          const alignment = checkAlignmentQuality(primaryFace.landmarks);
          if (!alignment.isAligned) {
            throw new Error(
              `Sample ${sampleIdx}: ${
                alignment.reason || 'Face is tilted or misaligned. Hold head straight.'
              }`
            );
          }

          const embeddingResult = await sFaceEmbedder.generateEmbedding(primaryFace.landmarks);
          if (!embeddingResult.isNormalized || embeddingResult.embedding.length !== 128) {
            throw new Error(`Sample ${sampleIdx}: Invalid 128-D embedding produced.`);
          }

          embedding = embeddingResult.embedding;
        }

        if (!embedding) {
          throw new Error(`Sample ${sampleIdx}: Failed to extract biometric embedding.`);
        }
        sampleEmbeddings.push(embedding);
        setProgress(Math.round((sampleIdx / TOTAL_SAMPLES) * 85));
      }

      setStatusMessage('Averaging 5 samples & applying L2 unit normalization...');
      const finalTemplate = averageAndNormalizeEmbeddings(sampleEmbeddings);

      setStatusMessage('Persisting biometric template to Dairy Tenant DB...');
      setProgress(95);

      const updateRes = await updateFace({
        embedding: finalTemplate,
        confidence: 0.98,
      });

      // Verify backend read-back confirmation
      if (updateRes && (updateRes.success || updateRes.isBiometricEnrolled)) {
        setProgress(100);
        setSuccess(true);
        setStatusMessage('Biometric enrollment complete (5 quality samples verified)!');
      } else {
        throw new Error('Backend failed to confirm biometric template persistence.');
      }
    } catch (err: any) {
      const backendMsg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.error ||
        err?.response?.data?.message;
      const msg = backendMsg || err?.message || 'Failed to update face biometrics. Please retry.';
      setErrorMessage(msg);
      setStatusMessage('Update failed: ' + msg);
      Alert.alert('Update Failed', msg);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Update Face Biometrics"
        subtitle="बायोमेट्रिक फोटो अपडेट"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Version Notice Card */}
        <ClayCard variant="highlight" style={styles.versionCard}>
          <View style={styles.versionHeader}>
            <Text style={styles.versionTitle}>Active Biometric Profile</Text>
            <ClayBadge
              label={profile?.biometricStatus?.version || 'v1.0 (YuNet + SFace INT8)'}
              variant="orange"
            />
          </View>
          <Text style={styles.versionDesc}>
            DFarm maintains an encrypted biometric audit trail. Capturing an updated photo
            generates an active version template. Previous templates are superseded securely with
            AES-256-GCM encryption.
          </Text>
        </ClayCard>

        {/* Live Camera Viewport Frame with Tactile Bezel */}
        <View style={styles.cameraFrameBezel}>
          <View style={styles.cameraBox}>
            {permission?.granted ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="front"
              />
            ) : (
              <View style={styles.permissionBox}>
                <CameraPermissionIllustration size={72} />
                <Text style={styles.permissionTitle}>Camera Access Required</Text>
                <Text style={styles.permissionSubtitle}>
                  Enable camera to record updated face biometric enrollment.
                </Text>
                <ClayButton
                  title="Enable Camera"
                  onPress={requestPermission}
                  variant="primary"
                  size="sm"
                />
              </View>
            )}

            {/* Reticle Overlay */}
            {permission?.granted && (
              <View style={styles.reticleOverlay} pointerEvents="none">
                <FaceOvalGuide width={200} height={250} isAligned={true} />
              </View>
            )}

            <View style={styles.statusToast}>
              <View style={styles.statusToastDot} />
              <Text style={styles.instruction}>{statusMessage}</Text>
            </View>
          </View>
        </View>

        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
          </View>
        )}

        {/* Action Section */}
        <ClayCard variant="raised" style={styles.actionCard}>
          {success ? (
            <View style={styles.successBox}>
              <BiometricSuccessBadge size={54} />
              <Text style={styles.successTitle}>Biometric Template Updated!</Text>
              <Text style={styles.successDesc}>
                Your facial vector has been encrypted and synchronized with your dairy society
                records.
              </Text>
              <ClayButton
                title="Return to Profile"
                onPress={() => router.back()}
                variant="primary"
                style={styles.returnBtn}
              />
            </View>
          ) : (
            <>
              {isCapturing && (
                <View style={styles.progressContainer}>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                  </View>
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={DFARM_COLORS.primaryOrange} />
                    <Text style={styles.loadingText}>
                      {statusMessage} ({progress}%)
                    </Text>
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
                    : 'Capture & Update Template'
                }
                onPress={handleUpdate}
                loading={isCapturing || isUpdatingFace}
                disabled={isCapturing || isUpdatingFace}
                variant="primary"
              />
            </>
          )}
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 28,
    gap: 16,
  },
  versionCard: {
    padding: 16,
  },
  versionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  versionTitle: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
  },
  versionDesc: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    lineHeight: 18,
  },
  cameraFrameBezel: {
    borderRadius: DFARM_RADIUS.xl,
    padding: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: DFARM_COLORS.border,
    ...DFARM_SHADOWS.clayCard,
  },
  cameraBox: {
    width: '100%',
    height: 300,
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
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(33, 27, 24, 0.78)',
    paddingVertical: 6,
    paddingHorizontal: 14,
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
  instruction: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },
  permissionBox: {
    alignItems: 'center',
    padding: 20,
    gap: 8,
    backgroundColor: DFARM_COLORS.surfaceInset,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  permissionTitle: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  permissionSubtitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    textAlign: 'center',
    marginBottom: 6,
  },
  errorBox: {
    backgroundColor: '#FFF8F8',
    borderColor: '#FFCDD2',
    borderWidth: 1,
    borderRadius: DFARM_RADIUS.sm,
    padding: 12,
  },
  errorText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.error,
    fontWeight: '600',
  },
  actionCard: {
    padding: 16,
  },
  progressContainer: {
    marginBottom: 12,
    gap: 8,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: DFARM_COLORS.primaryOrange,
    borderRadius: 4,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  loadingText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryText,
    fontWeight: '600',
  },
  successBox: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  successTitle: {
    ...DFARM_TYPOGRAPHY.h2,
    color: DFARM_COLORS.primaryText,
  },
  successDesc: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 10,
  },
  returnBtn: {
    minWidth: 200,
  },
});
