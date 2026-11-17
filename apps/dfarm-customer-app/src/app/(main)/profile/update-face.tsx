import React, { useState, useRef } from 'react';
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
import { checkAlignmentQuality } from '../../../face-ai/preprocessor';
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
  const [isCapturing, setIsCapturing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Center your face inside the oval reticle');
  const cameraRef = useRef<any>(null);

  const handleUpdate = async () => {
    setErrorMessage(null);
    setIsCapturing(true);
    setStatusMessage('Initializing YuNet & SFace models...');

    try {
      await yuNetDetector.initialize();
      await sFaceEmbedder.initialize();

      setStatusMessage('Detecting face in viewport...');
      const detection = await yuNetDetector.detectFaces({ width: 640, height: 640 });

      if (!detection.faces || detection.faces.length === 0) {
        throw new Error('No face detected. Please ensure your face is inside the reticle.');
      }

      if (detection.faces.length > 1) {
        throw new Error('Multiple faces detected. Only the enrolled farmer must be in view.');
      }

      const primaryFace = detection.faces[0];
      const alignment = checkAlignmentQuality(primaryFace.landmarks);
      if (!alignment.isAligned) {
        throw new Error(alignment.reason || 'Face is tilted or misaligned. Hold head straight.');
      }

      setStatusMessage('Generating updated SFace INT8 embedding...');
      const embeddingResult = await sFaceEmbedder.generateEmbedding(primaryFace.landmarks);

      setStatusMessage('Submitting updated template to dairy backend...');
      await updateFace({
        embedding: embeddingResult.embedding,
        confidence: primaryFace.confidence || 0.97,
      });

      setSuccess(true);
      setStatusMessage('Biometrics updated successfully!');
    } catch (err: any) {
      const msg = err?.message || 'Failed to update face biometrics. Please retry.';
      setErrorMessage(msg);
      setStatusMessage('Update failed. Please retry.');
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
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={DFARM_COLORS.primaryOrange} />
                  <Text style={styles.loadingText}>{statusMessage}</Text>
                </View>
              )}
              <ClayButton
                title={
                  isCapturing ? 'Processing Biometrics...' : 'Capture & Update Template'
                }
                onPress={handleUpdate}
                loading={isCapturing || isUpdatingFace}
                disabled={isCapturing || !permission?.granted}
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
