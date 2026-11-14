import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { colors } from '../../components/theme/colors';
import { Button } from '../../components/common/Button';
import { ThermalSlip } from '../../components/common/ThermalSlip';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { collectionsApi } from '../../api/collections.api';

export interface CollectionDetailScreenProps {
  route: {
    params: {
      sessionId: string;
      receiptNumber?: string;
    };
  };
  navigation: any;
}

export const CollectionDetailScreen: React.FC<CollectionDetailScreenProps> = ({
  route,
  navigation,
}) => {
  const { sessionId, receiptNumber } = route.params;
  const [receiptText, setReceiptText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    async function loadReceipt() {
      try {
        const text = await collectionsApi.getSessionReceipt(sessionId);
        setReceiptText(text);
      } catch (err: any) {
        setErrorMsg(err.message || 'Unable to retrieve thermal receipt');
      } finally {
        setLoading(false);
      }
    }
    loadReceipt();
  }, [sessionId]);

  const handleShare = async () => {
    if (!receiptText) return;
    setIsSharing(true);
    try {
      // Generate clean HTML printable document
      const html = `
        <html>
          <head>
            <style>
              body { font-family: monospace; font-size: 14px; padding: 20px; white-space: pre-wrap; }
            </style>
          </head>
          <body>${receiptText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Milk Receipt #${receiptNumber || sessionId.substring(0, 8)}`,
        });
      } else {
        Alert.alert('Sharing Unavailable', 'File sharing is not available on this device');
      }
    } catch (err: any) {
      Alert.alert('Print Error', err.message || 'Failed to print/share thermal slip');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loading ? (
          <LoadingSpinner message="Fetching thermal receipt..." fullScreen />
        ) : errorMsg ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Receipt Not Available</Text>
            <Text style={styles.errorDesc}>{errorMsg}</Text>
            <Button
              title="Go Back"
              variant="outline"
              onPress={() => navigation.goBack()}
              style={{ marginTop: 16 }}
            />
          </View>
        ) : (
          <View style={styles.content}>
            <ThermalSlip
              slipText={receiptText || 'No receipt data'}
              receiptNumber={receiptNumber}
            />

            <View style={styles.unitNote}>
              <Text style={styles.unitNoteTitle}>⚖️ Official Measurement Unit: KG</Text>
              <Text style={styles.unitNoteDesc}>
                In strict compliance with DFarm weights and measures standards, milk quantities are recorded, calculated, and settled in Kilograms (KG). Quantities are never silently converted to Liters.
              </Text>
            </View>

            <View style={styles.actionsRow}>
              <Button
                title="Share / Save PDF"
                variant="primary"
                onPress={handleShare}
                loading={isSharing}
                style={styles.actionBtn}
              />
              <Button
                title="Close"
                variant="secondary"
                onPress={() => navigation.goBack()}
                style={styles.actionBtn}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1E293B', // Darker backdrop for thermal receipt paper effect
  },
  scrollContent: {
    padding: 16,
    flexGrow: 1,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  unitNote: {
    backgroundColor: '#334155',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
    width: '100%',
    maxWidth: 360,
  },
  unitNoteTitle: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 4,
  },
  unitNoteDesc: {
    color: '#CBD5E1',
    fontSize: 11,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
    maxWidth: 360,
  },
  actionBtn: {
    flex: 1,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.card,
    borderRadius: 16,
  },
  errorIcon: {
    fontSize: 40,
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
