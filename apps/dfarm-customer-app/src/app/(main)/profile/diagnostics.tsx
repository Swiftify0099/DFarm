import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { runFaceDiagnostics } from '../../../face-ai/diagnostics';
import { useProfile } from '../../../features/profile/useProfile';
import { FaceDiagnosticsReport } from '../../../types/face';
import { FaceOvalGuide, CameraPermissionIllustration } from '../../../assets/vectors/BiometricAssets';

export default function FaceDiagnosticsScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<FaceDiagnosticsReport | null>(null);
  const cameraRef = useRef<any>(null);
  const { profile } = useProfile();

  const handleRunDiagnostics = async () => {
    if (!permission?.granted) {
      await requestPermission();
      return;
    }

    setIsRunning(true);
    try {
      let imageBase64: string | undefined = undefined;
      if (cameraRef.current) {
        try {
          const photo = await cameraRef.current.takePictureAsync({
            base64: true,
            quality: 0.6,
            shutterSound: false,
          });
          if (photo?.base64) {
            imageBase64 = photo.base64;
          }
        } catch (camErr) {
          console.warn('[FaceDiagnostics] Failed to capture camera photo:', camErr);
        }
      }
      const res = await runFaceDiagnostics({
        cameraPermissionGranted: Boolean(permission?.granted),
        customerId: profile?.id,
        dairyId: profile?.dairyId,
        imageBase64,
      });
      setReport(res);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ClayHeader
        title="Test My Face"
        subtitle="बायोमेट्रिक सेन्सर व मॉडेल चाचणी"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Warning Card about Identity vs Detection */}
        <ClayCard variant="highlight" style={styles.disclaimerCard}>
          <Text style={styles.disclaimerTitle}>Diagnostics & Verification Mode</Text>
          <Text style={styles.disclaimerText}>
            This test verifies live front-camera sensor telemetry, OpenCV YuNet
            face detection, and OpenCV SFace INT8 128-D embedding extraction.
            It performs a read-only match against your enrolled profile template.
          </Text>
        </ClayCard>

        {/* Live Camera Viewport with Tactile Clay Bezel */}
        <View style={styles.cameraFrameBezel}>
          <View style={styles.cameraViewport}>
            {permission?.granted ? (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="front"
              />
            ) : (
              <View style={styles.permissionBox}>
                <CameraPermissionIllustration size={72} />
                <Text style={styles.permissionTitle}>Camera Permission Required</Text>
                <Text style={styles.permissionSubtitle}>
                  Allow camera access to test face sensor and real-time inference.
                </Text>
                <ClayButton
                  title="Enable Camera"
                  onPress={requestPermission}
                  variant="primary"
                  size="sm"
                />
              </View>
            )}

            {/* Oval reticle overlay */}
            {permission?.granted && (
              <View style={styles.reticleOverlay} pointerEvents="none">
                <FaceOvalGuide width={200} height={250} isAligned={true} />
              </View>
            )}
          </View>
        </View>

        {/* Telemetry Report Card */}
        {report ? (
          <ClayCard variant="raised" style={styles.reportCard}>
            <View style={styles.reportHeader}>
              <Text style={styles.reportTitle}>Diagnostic Telemetry</Text>
              <ClayBadge
                label={report.discreteStatus || report.status}
                variant={
                  report.discreteStatus === 'FACE_MATCHED'
                    ? 'success'
                    : report.discreteStatus === 'ENROLLMENT_NOT_FOUND'
                    ? 'warning'
                    : report.discreteStatus === 'FACE_NOT_MATCHED'
                    ? 'error'
                    : report.status === 'OPTIMAL'
                    ? 'success'
                    : 'warning'
                }
              />
            </View>

            {/* Discrete Status Result Hero Banner */}
            {report.discreteStatus && (
              <View
                style={[
                  styles.statusHeroBanner,
                  report.discreteStatus === 'FACE_MATCHED'
                    ? styles.statusHeroSuccess
                    : report.discreteStatus === 'ENROLLMENT_NOT_FOUND'
                    ? styles.statusHeroWarning
                    : styles.statusHeroError,
                ]}
              >
                <Text style={styles.statusHeroTitle}>
                  {report.discreteStatus === 'FACE_MATCHED'
                    ? '✅ FACE MATCHED (चेहरा ओळखला)'
                    : report.discreteStatus === 'FACE_NOT_MATCHED'
                    ? '❌ FACE NOT MATCHED (चेहरा जुळला नाही)'
                    : report.discreteStatus === 'ENROLLMENT_NOT_FOUND'
                    ? '⚠️ ENROLLMENT NOT FOUND (बायोमेट्रिक नोंदणी आढळली नाही)'
                    : report.discreteStatus === 'NO_FACE_DETECTED'
                    ? '👤 NO FACE DETECTED (चेहरा आढळला नाही)'
                    : report.discreteStatus === 'MULTIPLE_FACES_DETECTED'
                    ? '👥 MULTIPLE FACES DETECTED (एकाधिक चेहरे आढळले)'
                    : report.discreteStatus === 'MODEL_LOAD_FAILED'
                    ? '⚠️ MODEL LOAD FAILED (मॉडेल लोड अयशस्वी)'
                    : report.discreteStatus === 'NETWORK_ERROR'
                    ? '📡 NETWORK ERROR (नेटवर्क त्रुटी)'
                    : 'FACE DETECTED'}
                </Text>

                {report.matchedFarmerName ? (
                  <Text style={styles.statusHeroFarmer}>
                    Farmer: {report.matchedFarmerName}{' '}
                    {report.farmerCode ? `(${report.farmerCode})` : ''}
                  </Text>
                ) : null}

                {typeof report.matchScore === 'number' ? (
                  <Text style={styles.statusHeroScore}>
                    Cosine Similarity: {(report.matchScore * 100).toFixed(1)}% (Threshold: 36.3%)
                  </Text>
                ) : null}
              </View>
            )}

            <View style={styles.telemetryGrid}>
              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Camera Sensor</Text>
                <ClayBadge
                  label={permission?.granted ? 'Granted (30 FPS)' : 'Denied'}
                  variant={permission?.granted ? 'success' : 'error'}
                />
              </View>

              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>YuNet Face Detector</Text>
                <ClayBadge
                  label={`Loaded (${report.yuNetLatencyMs}ms)`}
                  variant="success"
                />
              </View>

              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>SFace INT8 Embedder</Text>
                <ClayBadge
                  label={`Loaded (${report.sFaceLatencyMs}ms)`}
                  variant="success"
                />
              </View>

              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Face Detection</Text>
                <ClayBadge
                  label={`${report.facesDetectedCount} Face Detected`}
                  variant={report.facesDetectedCount === 1 ? 'success' : 'warning'}
                />
              </View>

              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>Landmark Alignment</Text>
                <ClayBadge
                  label={report.primaryFaceAligned ? 'Optimal' : 'Tilted'}
                  variant={report.primaryFaceAligned ? 'success' : 'warning'}
                />
              </View>

              <View style={styles.telemetryItem}>
                <Text style={styles.telemetryLabel}>128-D Vector Integrity</Text>
                <ClayBadge
                  label={report.embeddingValid128D ? 'Unit L2 Valid' : 'Invalid'}
                  variant={report.embeddingValid128D ? 'success' : 'error'}
                />
              </View>

              {report.matchStatus && (
                <View style={styles.telemetryItem}>
                  <Text style={styles.telemetryLabel}>Template Match Verification</Text>
                  <ClayBadge
                    label={
                      report.matchStatus === 'MATCH_VERIFIED'
                        ? `Verified (${report.matchedFarmerName || 'Farmer Match'})`
                        : report.matchStatus === 'NOT_ENROLLED'
                        ? 'Not Enrolled'
                        : report.matchStatus === 'MATCH_FAILED'
                        ? 'Template Mismatch'
                        : report.matchStatus === 'BACKEND_ERROR'
                        ? 'Server Offline'
                        : 'Skipped'
                    }
                    variant={
                      report.matchStatus === 'MATCH_VERIFIED'
                        ? 'success'
                        : report.matchStatus === 'NOT_ENROLLED'
                        ? 'warning'
                        : 'error'
                    }
                  />
                </View>
              )}
            </View>

            {report.statusMessage ? (
              <View style={styles.statusMessageBox}>
                <Text style={styles.statusMessageText}>{report.statusMessage}</Text>
              </View>
            ) : null}
          </ClayCard>
        ) : null}

        {/* Action Button */}
        <ClayCard variant="raised" style={styles.actionCard}>
          <ClayButton
            title={isRunning ? 'Evaluating Sensors...' : 'Run Diagnostics Test'}
            onPress={handleRunDiagnostics}
            loading={isRunning}
            disabled={!permission?.granted || isRunning}
            variant="primary"
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
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: 28,
    gap: 16,
  },
  disclaimerCard: {
    padding: 16,
  },
  disclaimerTitle: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
    marginBottom: 6,
  },
  disclaimerText: {
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
  cameraViewport: {
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
  permissionBox: {
    alignItems: 'center',
    padding: 20,
    gap: 10,
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
  reportCard: {
    padding: 18,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportTitle: {
    ...DFARM_TYPOGRAPHY.h3,
    color: DFARM_COLORS.primaryText,
  },
  telemetryGrid: {
    gap: 10,
  },
  telemetryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: DFARM_COLORS.surfaceInset,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: DFARM_RADIUS.sm,
    borderWidth: 1,
    borderColor: DFARM_COLORS.border,
  },
  telemetryLabel: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
    fontWeight: '600',
  },
  actionCard: {
    padding: 16,
  },
  statusMessageBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: DFARM_RADIUS.sm,
    backgroundColor: DFARM_COLORS.surfaceInset,
    borderLeftWidth: 4,
    borderLeftColor: DFARM_COLORS.primaryOrange,
  },
  statusMessageText: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.primaryText,
    fontWeight: '500',
  },
  statusHeroBanner: {
    padding: 12,
    borderRadius: DFARM_RADIUS.md,
    marginBottom: 14,
    borderWidth: 1.5,
  },
  statusHeroSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  statusHeroWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  statusHeroError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  statusHeroTitle: {
    ...DFARM_TYPOGRAPHY.bodyMd,
    fontWeight: '700',
    color: DFARM_COLORS.primaryText,
    marginBottom: 4,
  },
  statusHeroFarmer: {
    ...DFARM_TYPOGRAPHY.bodySm,
    fontWeight: '600',
    color: '#065F46',
    marginBottom: 2,
  },
  statusHeroScore: {
    ...DFARM_TYPOGRAPHY.bodySm,
    color: DFARM_COLORS.secondaryText,
  },
});
