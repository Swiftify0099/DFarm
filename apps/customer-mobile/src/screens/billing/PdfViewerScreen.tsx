import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Alert,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { colors } from '../../components/theme/colors';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { getAuthToken } from '../../storage/secure-token';
import { API_BASE_URL } from '../../api/client';

export interface PdfViewerScreenProps {
  route: {
    params: {
      billId: string;
      billNumber: string;
    };
  };
  navigation: any;
}

export const PdfViewerScreen: React.FC<PdfViewerScreenProps> = ({ route, navigation }) => {
  const { billId, billNumber } = route.params;

  const [downloading, setDownloading] = useState(true);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    async function downloadPdfStatement() {
      try {
        const token = await getAuthToken();
        if (!token) {
          throw new Error('Customer authentication session expired');
        }

        const downloadUrl = `${API_BASE_URL}/billing/bills/${billId}/pdf`;
        const targetFileUri = `${FileSystem.documentDirectory}statement_${billNumber || billId}.pdf`;

        const downloadResult = await FileSystem.downloadAsync(downloadUrl, targetFileUri, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (downloadResult.status !== 200) {
          throw new Error(`Server returned HTTP ${downloadResult.status}. PDF statement may not be generated yet.`);
        }

        const fileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
        setLocalUri(downloadResult.uri);
        if (fileInfo.exists && typeof fileInfo.size === 'number') {
          setFileSize(fileInfo.size);
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to download authorized statement PDF');
      } finally {
        setDownloading(false);
      }
    }

    downloadPdfStatement();
  }, [billId, billNumber]);

  const handleShare = async () => {
    if (!localUri) return;
    setIsSharing(true);
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(localUri, {
          mimeType: 'application/pdf',
          dialogTitle: `DFarm Statement #${billNumber}`,
        });
      } else {
        Alert.alert('Sharing Unavailable', 'Native file sharing is not supported on this device');
      }
    } catch (err: any) {
      Alert.alert('Share Error', err.message || 'Unable to share PDF statement');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {downloading ? (
          <LoadingSpinner message="Downloading authorized PDF statement..." fullScreen />
        ) : errorMsg ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Statement Unavailable</Text>
            <Text style={styles.errorDesc}>{errorMsg}</Text>
            <Button
              title="Go Back"
              variant="outline"
              onPress={() => navigation.goBack()}
              style={{ marginTop: 16 }}
            />
          </View>
        ) : (
          <Card variant="elevated" style={styles.previewCard}>
            <View style={styles.pdfIconWrapper}>
              <Text style={styles.pdfEmoji}>📄</Text>
            </View>

            <Text style={styles.statementTitle}>Statement #{billNumber}</Text>
            <Text style={styles.statementSubtitle}>
              DFarm Official Monthly Milk Settlement Statement
            </Text>

            <View style={styles.metaBox}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Status:</Text>
                <Text style={styles.metaValGreen}>Verified & Downloaded</Text>
              </View>
              {fileSize && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>File Size:</Text>
                  <Text style={styles.metaVal}>{(fileSize / 1024).toFixed(1)} KB</Text>
                </View>
              )}
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Security:</Text>
                <Text style={styles.metaVal}>Authorized Bearer Session</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <Button
                title="📤 Share / Export PDF"
                variant="primary"
                onPress={handleShare}
                loading={isSharing}
                style={styles.actionBtn}
              />
              <Button
                title="Done"
                variant="secondary"
                onPress={() => navigation.goBack()}
                style={styles.actionBtn}
              />
            </View>
          </Card>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewCard: {
    width: '100%',
    maxWidth: 380,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  pdfIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  pdfEmoji: {
    fontSize: 40,
  },
  statementTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statementSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  metaBox: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginBottom: 24,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  metaVal: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  metaValGreen: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  actionBtn: {
    width: '100%',
  },
  errorBox: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    maxWidth: 340,
  },
  errorIcon: {
    fontSize: 44,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  errorDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
});
