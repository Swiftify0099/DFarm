const mockPlatform = {
  OS: 'android',
  constants: {} as Record<string, any>,
};

jest.mock('react-native', () => ({
  Platform: mockPlatform,
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    isDevice: undefined,
    expoConfig: {},
  },
}));

jest.mock('../../src/services/secure-storage', () => ({
  secureStorage: {
    getAccessToken: jest.fn(),
    getDairyId: jest.fn(),
    getRefreshToken: jest.fn(),
    saveSession: jest.fn(),
    clearSession: jest.fn(),
  },
}));

import { isAndroidEmulator } from '../../src/services/api-client';

describe('DFarm ApiClient Host & Emulator Resolution', () => {
  beforeEach(() => {
    mockPlatform.OS = 'android';
    mockPlatform.constants = {};
  });

  test('identifies Android emulator with Google SDK model', () => {
    mockPlatform.OS = 'android';
    mockPlatform.constants = {
      Model: 'sdk_gphone64_x86_64',
      Brand: 'google',
      Manufacturer: 'Google',
      Fingerprint: 'google/sdk_gphone64_x86_64/emu64xa',
    };
    expect(isAndroidEmulator()).toBe(true);
  });

  test('identifies Android emulator with lowercase constants properties', () => {
    mockPlatform.OS = 'android';
    mockPlatform.constants = {
      model: 'sdk_gphone64_x86_64',
      brand: 'google',
      hardware: 'ranchu',
    };
    expect(isAndroidEmulator()).toBe(true);
  });

  test('identifies Genymotion or Goldfish emulators', () => {
    mockPlatform.OS = 'android';
    mockPlatform.constants = {
      Manufacturer: 'Genymotion',
      Hardware: 'goldfish',
    };
    expect(isAndroidEmulator()).toBe(true);
  });

  test('returns false for physical Android device (e.g. Samsung Galaxy)', () => {
    mockPlatform.OS = 'android';
    mockPlatform.constants = {
      Model: 'SM-S918B',
      Brand: 'samsung',
      Manufacturer: 'samsung',
      Fingerprint: 'samsung/dm3qxxx/dm3q:14/UP1A.231005.007/S918BXXU3BWJM:user/release-keys',
      Hardware: 'qcom',
      Product: 'dm3qxxx',
    };
    expect(isAndroidEmulator()).toBe(false);
  });

  test('returns false on non-Android platforms', () => {
    mockPlatform.OS = 'ios';
    expect(isAndroidEmulator()).toBe(false);
  });
});
