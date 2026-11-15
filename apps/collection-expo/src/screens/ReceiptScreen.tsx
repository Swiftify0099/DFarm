import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { ClayButton } from '../components/clay/ClayButton';
import { ClayAlert } from '../components/clay/ClayAlert';
import { ClayReceiptCard } from '../components/clay/ClayReceiptCard';
import { BluetoothEscPosPrinterService } from '../hardware/BluetoothEscPosPrinterService';
import { ClayImages } from '../theme/assets';

interface ReceiptScreenProps {
  receiptText: string;
  onDone: () => void;
}

export const ReceiptScreen: React.FC<ReceiptScreenProps> = ({
  receiptText,
  onDone,
}) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState<boolean | null>(null);
  const [reprintCount, setReprintCount] = useState(0);
  const [printerStatus, setPrinterStatus] = useState<string>('BT ESC/POS PRINTER READY');

  const handlePrint = async (isDuplicate: boolean = false) => {
    setIsPrinting(true);
    setPrintSuccess(null);
    try {
      const printer = new BluetoothEscPosPrinterService();
      await printer.connect();

      const lines = receiptText.split('\n');
      if (isDuplicate) {
        lines.unshift('*** DUPLICATE REPRINT ***', '');
      }

      const res = await printer.printReceipt(lines);
      setIsPrinting(false);
      if (res.success) {
        setPrintSuccess(true);
        if (isDuplicate) {
          setReprintCount((c) => c + 1);
        }
        setPrinterStatus(
          isDuplicate
            ? `REPRINT #${reprintCount + 1} DISPATCHED VIA BLUETOOTH SPP`
            : 'RECEIPT DISPATCHED VIA BLUETOOTH SPP (40-COL)'
        );
      } else {
        setPrintSuccess(false);
        setPrinterStatus(`PRINT FAILED: ${res.error}`);
      }
    } catch (e: any) {
      setIsPrinting(false);
      setPrintSuccess(false);
      setPrinterStatus(`PRINTER ERROR: ${e.message}`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 3D Success Badge Header */}
      <View style={styles.successHeader}>
        <View style={styles.successImageContainer}>
          <Image
            source={ClayImages.collectionSuccess}
            style={styles.successImage}
            resizeMode="contain"
          />
        </View>
        <Text style={[typography.headlineMedium, { textAlign: 'center', marginTop: 12 }]}>
          INTAKE COMMITTED &amp; SAVED
        </Text>
        <Text style={[typography.bodyMedium, { textAlign: 'center', color: colors.textSecondary, marginTop: 2 }]}>
          Ledger transaction posted &bull; 40-Column ESC/POS Thermal Slip Ready
        </Text>
      </View>

      <View style={{ height: 16 }} />

      {/* Print Success / Failure Alert */}
      {printSuccess === true && (
        <ClayAlert
          type="success"
          title="Print Dispatched"
          message="Receipt successfully sent to 58mm/80mm Bluetooth ESC/POS thermal printer."
          onDismiss={() => setPrintSuccess(null)}
          style={{ maxWidth: 440 }}
        />
      )}
      {printSuccess === false && (
        <ClayAlert
          type="error"
          title="Thermal Printer Warning"
          message={printerStatus}
          onDismiss={() => setPrintSuccess(null)}
          style={{ maxWidth: 440 }}
        />
      )}

      {/* Tactile Receipt Slip Card */}
      <ClayReceiptCard
        receiptText={receiptText}
        reprintCount={reprintCount}
        printerStatus={printerStatus}
      />

      <View style={{ height: 20 }} />

      {/* Hardware Print Controls */}
      <View style={styles.buttonGroup}>
        <ClayButton
          title={isPrinting ? 'SENDING TO THERMAL PRINTER...' : 'PRINT THERMAL RECEIPT (ESC/POS)'}
          onPress={() => handlePrint(false)}
          variant="primary"
          disabled={isPrinting}
          size="lg"
        />

        <View style={{ height: 12 }} />

        <ClayButton
          title="REPRINT RECEIPT (SAFE DUPLICATE)"
          onPress={() => handlePrint(true)}
          variant="secondary"
          disabled={isPrinting}
          size="md"
        />

        <View style={{ height: 12 }} />

        <ClayButton
          title="DONE (NEXT CUSTOMER) &rarr;"
          onPress={onDone}
          variant="outline"
          size="lg"
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.clayBgDark,
  },
  content: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  successHeader: {
    alignItems: 'center',
  },
  successImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successImage: {
    width: 72,
    height: 72,
  },
  buttonGroup: {
    width: '100%',
    maxWidth: 440,
  },
});
