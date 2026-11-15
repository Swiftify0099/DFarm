import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Pure TypeScript theme import (no react-native runtime dependency)
import { colors } from '../theme/colors';

describe('Claymorphism UI Transformation Verification Suite', () => {
  test('1. Color Palette: All original tokens preserved + Claymorphic & Registration Expo parity tokens active', () => {
    // Original tokens (Zero regression check)
    assert.equal(colors.primaryGreen, '#1B5E20');
    assert.equal(colors.primaryLight, '#4C8C4A');
    assert.equal(colors.accentAmber, '#FF8F00');
    assert.equal(colors.backgroundDark, '#121212');
    assert.equal(colors.surfaceDark, '#1E1E1E');
    assert.equal(colors.cardBackground, '#2C2C2C');
    assert.equal(colors.textPrimary, '#FFFFFF');
    assert.equal(colors.textSecondary, '#B0BEC5');
    assert.equal(colors.statusValid, '#4CAF50');
    assert.equal(colors.statusError, '#E53935');
    assert.equal(colors.statusWarning, '#FFA000');
    assert.equal(colors.borderDark, '#333333');
    assert.equal(colors.inputBorder, '#444444');
    assert.equal(colors.chipUnselected, '#242424');

    // Claymorphic surface tokens
    assert.equal(colors.clayBgDark, '#0F1318');
    assert.equal(colors.claySurface, '#19202A');
    assert.equal(colors.claySurfaceCard, '#1E2633');
    assert.equal(colors.clayGreen, '#2E7D32');

    // Registration Expo parity tokens
    assert.equal(colors.primary, '#00506E');
    assert.equal(colors.statusActiveText, '#137333');
    assert.equal(colors.categoryCowText, '#E65100');
    assert.equal(colors.categoryBuffaloText, '#37474F');
  });

  test('2. Clay Theme & Typography: Source files define 3D elevation, bevels, and receipt typography', () => {
    const clayPath = path.resolve(__dirname, '../theme/clay.ts');
    assert.ok(fs.existsSync(clayPath), 'theme/clay.ts must exist');
    const clayContent = fs.readFileSync(clayPath, 'utf8');
    assert.ok(clayContent.includes('clayBorderRadius'), 'clay.ts must define clayBorderRadius');
    assert.ok(clayContent.includes('clayShadows'), 'clay.ts must define clayShadows');
    assert.ok(clayContent.includes('raisedMd'), 'clay.ts must define raisedMd');
    assert.ok(clayContent.includes('inset'), 'clay.ts must define inset styles');

    const typoPath = path.resolve(__dirname, '../theme/typography.ts');
    assert.ok(fs.existsSync(typoPath), 'theme/typography.ts must exist');
    const typoContent = fs.readFileSync(typoPath, 'utf8');
    assert.ok(typoContent.includes('displayMetric'), 'typography.ts must define displayMetric');
    assert.ok(typoContent.includes('monospaceReceipt'), 'typography.ts must define monospaceReceipt');
  });

  test('3. Reusable Clay Components: Source files exist and implement Claymorphism', () => {
    const clayDir = path.resolve(__dirname, '../components/clay');
    assert.ok(fs.existsSync(clayDir), 'components/clay directory must exist');

    const expectedComponents = [
      'ClayCard.tsx',
      'ClayButton.tsx',
      'ClayInput.tsx',
      'ClayNumericDisplay.tsx',
      'ClayDeviceBadge.tsx',
      'ClayStatusBadge.tsx',
      'ClayCategoryBadge.tsx',
      'ClayFilterChip.tsx',
      'ClayDialog.tsx',
      'ClayReceiptCard.tsx',
      'ClayCustomerCard.tsx',
      'ClayAlert.tsx',
      'ClayEmptyState.tsx',
      'ClayLoading.tsx',
      'ClayHardwareHUD.tsx',
      'index.ts',
    ];

    for (const comp of expectedComponents) {
      const compPath = path.join(clayDir, comp);
      assert.ok(fs.existsSync(compPath), `Component ${comp} must exist`);
      const content = fs.readFileSync(compPath, 'utf8');
      assert.ok(content.length > 200, `Component ${comp} must have substantial content`);
    }
  });

  test('4. Common Components Parity: Button, Card, Input, Dialog, FilterChip integrate Claymorphism', () => {
    const commonDir = path.resolve(__dirname, '../components/common');
    const commonFiles = ['Button.tsx', 'Card.tsx', 'Input.tsx', 'Dialog.tsx', 'FilterChip.tsx'];

    for (const file of commonFiles) {
      const filePath = path.join(commonDir, file);
      assert.ok(fs.existsSync(filePath), `Common component ${file} must exist`);
      const content = fs.readFileSync(filePath, 'utf8');
      assert.ok(content.includes('Clay'), `Common component ${file} must delegate to Clay component`);
    }
  });

  test('5. Screen Transformations: All 9 collection screens transformed with Claymorphic components', () => {
    const screensDir = path.resolve(__dirname, '../screens');
    const expectedScreens = [
      'LoginScreen.tsx',
      'DashboardScreen.tsx',
      'IdentificationScreen.tsx',
      'CustomerInfoScreen.tsx',
      'CategorySelectionScreen.tsx',
      'MeasurementScreen.tsx',
      'TransactionReviewScreen.tsx',
      'ReceiptScreen.tsx',
      'HistoryScreen.tsx',
    ];

    for (const screen of expectedScreens) {
      const screenPath = path.join(screensDir, screen);
      assert.ok(fs.existsSync(screenPath), `Screen ${screen} must exist`);
      const content = fs.readFileSync(screenPath, 'utf8');
      assert.ok(content.includes('Clay'), `Screen ${screen} must use Claymorphism components`);
    }
  });

  test('6. Asset Manifest: All generated 3D illustration assets physically exist on disk', () => {
    const assetsDir = path.resolve(__dirname, '../../assets/images');
    assert.ok(fs.existsSync(assetsDir), 'assets/images directory must exist');

    const expectedFiles = [
      'collection-onboarding-3d.jpg',
      'customer-identification-guide.jpg',
      'face-scanning-guide-3d.jpg',
      'weight-scale-3d-illustration.jpg',
      'milk-analyzer-3d-illustration.jpg',
      'collection-success-3d.jpg',
      'collection-empty-state.jpg',
      'offline-sync-illustration.jpg',
    ];

    for (const file of expectedFiles) {
      const filePath = path.join(assetsDir, file);
      assert.ok(fs.existsSync(filePath), `Asset ${file} must exist on disk`);
      const stat = fs.statSync(filePath);
      assert.ok(stat.size > 10000, `Asset ${file} must be non-empty (got ${stat.size} bytes)`);
    }
  });
});
