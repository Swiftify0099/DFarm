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
import { FaceDiagnosticsReport } from '../../../types/face';
import { FaceOvalGuide, CameraPermissionIllustration } from '../../../assets/vectors/BiometricAssets';

export default function FaceDiagnosticsScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<FaceDiagnosticsReport | null>(null);
  const cameraRef = useRef<any>(null);

  const handleRunDiagnostics = async () => {
    setIsRunning(true);
    try {
      const res = await runFaceDiagnostics();
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
                label={report.status}
                variant={report.status === 'OPTIMAL' ? 'success' : 'warning'}
              />
            </View>

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
            </View>
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
});
