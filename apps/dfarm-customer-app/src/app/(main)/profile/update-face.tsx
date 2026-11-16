import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  DFARM_COLORS,
  DFARM_TYPOGRAPHY,
  DFARM_RADIUS,
  ClayCard,
  ClayBadge,
  ClayButton,
  ClayHeader,
} from '../../../design-system';
import { yuNetDetector } from '../../../face-ai/yunet-detector';
import { sFaceEmbedder } from '../../../face-ai/sface-embedder';
import { checkAlignmentQuality } from '../../../face-ai/preprocessor';
import { useProfile } from '../../../features/profile/useProfile';

export default function UpdateFaceScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const { profile, updateFace, isUpdatingFace } = useProfile();
  const [isCapturing, setIsCapturing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('Center your face and ensure good lighting');
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
        subtitle="Immutable Versioned Template Update"
        onBack={() => router.back()}
      />

      <View style={styles.content}>
        {/* Version Notice Card */}
        <ClayCard variant="highlight" style={styles.versionCard}>
          <View style={styles.versionHeader}>
            <Text style={styles.versionTitle}>Active Version</Text>
            <ClayBadge
              label={profile?.biometricStatus.version || 'v1.0 (YuNet + SFace INT8)'}
              variant="orange"
            />
          </View>
          <Text style={styles.versionDesc}>
            DFarm preserves full biometric audit history. Capturing a new photo
            will create an incremented active template. Previous templates are
            superseded securely and archived with AES-256-GCM encryption.
          </Text>
        </ClayCard>

        {/* Live Camera Viewport */}
        <View style={styles.cameraBox}>
          {permission?.granted ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
            />
          ) : (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionTitle}>Camera Access Required</Text>
              <Text style={styles.permissionSubtitle}>
                Enable camera to record updated face biometric enrollment.
              </Text>
              <ClayButton
                title="Enable Camera"
                onPress={requestPermission}
                variant="secondary"
              />
            </View>
          )}

          <View style={styles.reticle}>
            <Text style={styles.reticleIcon}>👤</Text>
          </View>
          <View style={styles.statusPill}>
            <Text style={styles.instruction}>
              {statusMessage}
            </Text>
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
              <Text style={styles.successIcon}>✅</Text>
              <Text style={styles.successTitle}>Biometrics Updated!</Text>
              <Text style={styles.successDesc}>
                New facial vector v2.0 has been securely registered with your dairy.
              </Text>
              <ClayButton
                title="Return to Profile"
                onPress={() => router.back()}
                variant="primary"
                style={styles.doneBtn}
              />
            </View>
          ) : (
            <>
              {isCapturing && (
                <View style={styles.progressRow}>
                  <ActivityIndicator color={DFARM_COLORS.primaryOrange} />
                  <Text style={styles.progressText}>
                    {statusMessage}
                  </Text>
                </View>
              )}
              <ClayButton
                title={isCapturing ? 'Processing Biometrics...' : 'Capture & Update Face Template'}
                onPress={handleUpdate}
                loading={isCapturing || isUpdatingFace}
                disabled={isCapturing}
                variant="primary"
                style={styles.updateBtn}
              />
            </>
          )}
        </ClayCard>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DFARM_COLORS.primaryCream,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  versionCard: {
    padding: 14,
    marginBottom: 8,
  },
  versionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  versionTitle: {
    ...DFARM_TYPOGRAPHY.bodyLg,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
  },
  versionDesc: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    lineHeight: 18,
  },
  cameraBox: {
    height: 300,
    backgroundColor: '#1A1A1A',
    borderRadius: DFARM_RADIUS.lg,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionBox: {
    alignItems: 'center',
    padding: 16,
  },
  permissionTitle: {
    ...DFARM_TYPOGRAPHY.bodyLg,
    color: '#FFFFFF',
    fontWeight: '700',
    marginBottom: 4,
  },
  permissionSubtitle: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: '#AAAAAA',
    textAlign: 'center',
    marginBottom: 12,
  },
  reticle: {
    width: 170,
    height: 220,
    borderRadius: 85,
    borderWidth: 2,
    borderColor: '#4ADE80',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleIcon: {
    fontSize: 48,
    opacity: 0.35,
  },
  statusPill: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  instruction: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 10,
    borderRadius: DFARM_RADIUS.sm,
    marginVertical: 4,
  },
  errorText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: '#DC2626',
    fontWeight: '600',
  },
  actionCard: {
    padding: 16,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  progressText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryOrange,
    marginLeft: 8,
    fontWeight: '600',
  },
  updateBtn: {
    width: '100%',
  },
  successBox: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  successIcon: {
    fontSize: 40,
    marginBottom: 6,
  },
  successTitle: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.success,
    marginBottom: 4,
  },
  successDesc: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    textAlign: 'center',
    marginBottom: 12,
  },
  doneBtn: {
    minWidth: 160,
  },
});
