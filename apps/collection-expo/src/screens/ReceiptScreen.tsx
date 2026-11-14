import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { BluetoothEscPosPrinterService } from '../hardware/BluetoothEscPosPrinterService';

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
      <Text style={[typography.headlineMedium, { textAlign: 'center' }]}>
        INTAKE RECEIPT (40-COL THERMAL SLIP)
      </Text>
      <View style={{ height: 8 }} />
      <Text style={[typography.bodyMedium, { textAlign: 'center', color: colors.textSecondary }]}>
        Hardware Status: {printerStatus}
      </Text>
      <View style={{ height: 16 }} />

      <Card style={styles.receiptCard} backgroundColor={colors.cardBackground}>
        {reprintCount > 0 && (
          <Text style={[typography.monospaceReceipt, { color: '#FFA000', fontWeight: 'bold' }]}>
            *** REPRINTED {reprintCount} TIME(S) ***{'\n'}
          </Text>
        )}
        <Text style={typography.monospaceReceipt}>{receiptText}</Text>
      </Card>

      <View style={{ height: 16 }} />

      {/* Hardware Print Controls */}
      <View style={styles.buttonGroup}>
        <Button
          title={isPrinting ? 'SENDING TO THERMAL PRINTER...' : 'PRINT THERMAL RECEIPT (ESC/POS)'}
          onPress={() => handlePrint(false)}
          variant="primary"
          disabled={isPrinting}
          style={styles.actionBtn}
        />
        <View style={{ height: 10 }} />
        <Button
          title="REPRINT RECEIPT (SAFE DUPLICATE)"
          onPress={() => handlePrint(true)}
          variant="secondary"
          disabled={isPrinting}
          style={styles.actionBtn}
        />
        <View style={{ height: 10 }} />
        <Button
          title="DONE (NEXT CUSTOMER)"
          onPress={onDone}
          variant="outline"
          style={styles.actionBtn}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  content: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  receiptCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
  },
  buttonGroup: {
    width: '100%',
    maxWidth: 420,
  },
  actionBtn: {
    width: '100%',
    height: 48,
  },
});
