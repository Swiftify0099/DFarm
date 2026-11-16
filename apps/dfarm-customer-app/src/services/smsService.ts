import * as SecureStore from 'expo-secure-store';

const DOVE_SMS_CONFIG = {
  apiUrl: 'https://mobicomm.dove-sms.com/submitsms.jsp',
  user: 'Experts',
  key: process.env.EXPO_PUBLIC_DOVE_SMS_KEY || 'ba9dcdcdfcXX',
  senderId: 'EXTSKL',
  accusage: '1',
  template: 'Your Verification Code for login is {OTP}. - Expertskill Technology.',
  ttlMs: 5 * 60 * 1000, // 5 minutes
};

// Strongly-typed pure TypeScript SHA-256 implementation
function sha256(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const maxWord = Math.pow(2, 32);
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  let padded = ascii + '\x80';
  while (padded.length % 64 !== 56) {
    padded += '\x00';
  }

  for (let i = 0; i < padded.length; i++) {
    const j = padded.charCodeAt(i);
    words[i >> 2] = (words[i >> 2] || 0) | (j << (((3 - i) % 4) * 8));
  }

  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15] || 0;
      const w2 = w[i - 2] || 0;

      const s0 =
        i < 16
          ? w[i] || 0
          : (w[i] =
              ((w[i - 16] || 0) +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                (w[i - 7] || 0) +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);

      const ch = ((hash[4] || 0) & (hash[5] || 0)) ^ (~(hash[4] || 0) & (hash[6] || 0));
      const maj =
        ((hash[0] || 0) & (hash[1] || 0)) ^
        ((hash[0] || 0) & (hash[2] || 0)) ^
        ((hash[1] || 0) & (hash[2] || 0));
      const s1 =
        rightRotate(hash[4] || 0, 6) ^
        rightRotate(hash[4] || 0, 11) ^
        rightRotate(hash[4] || 0, 25);
      const s0_2 =
        rightRotate(hash[0] || 0, 2) ^
        rightRotate(hash[0] || 0, 13) ^
        rightRotate(hash[0] || 0, 22);

      const temp1 = (hash[7] || 0) + s1 + ch + (k[i] || 0) + s0;
      const temp2 = s0_2 + maj;

      hash[7] = hash[6] || 0;
      hash[6] = hash[5] || 0;
      hash[5] = hash[4] || 0;
      hash[4] = ((hash[3] || 0) + temp1) | 0;
      hash[3] = hash[2] || 0;
      hash[2] = hash[1] || 0;
      hash[1] = hash[0] || 0;
      hash[0] = (temp1 + temp2) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = ((hash[i] || 0) + (oldHash[i] || 0)) | 0;
    }
  }

  let result = '';
  for (let i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = ((hash[i] || 0) >> (8 * b)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return result;
}

export class DirectDoveSmsService {
  private static readonly STORAGE_PREFIX = 'dfarm_direct_otp_';

  /**
   * Sends real SMS directly from mobile app using Dove SMS Gateway (emergency fallback).
   */
  public static async sendDirectDoveOtp(mobileNumber: string): Promise<{ success: boolean; message: string }> {
    const cleanDigits = mobileNumber.replace(/\D/g, '');
    const national = cleanDigits.slice(-10);
    const formattedMobile = `+91${national}`;

    // Generate random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const messageText = DOVE_SMS_CONFIG.template.replace('{OTP}', otp);

    const params = new URLSearchParams({
      user: DOVE_SMS_CONFIG.user,
      key: DOVE_SMS_CONFIG.key,
      mobile: formattedMobile,
      message: messageText,
      accusage: DOVE_SMS_CONFIG.accusage,
      senderid: DOVE_SMS_CONFIG.senderId,
    });

    const url = `${DOVE_SMS_CONFIG.apiUrl}?${params.toString()}`;

    try {
      await fetch(url, { method: 'GET' });

      // Save SHA-256 hash in storage for 5 minutes
      const hashed = sha256(otp);
      const payload = JSON.stringify({
        hash: hashed,
        expiresAt: Date.now() + DOVE_SMS_CONFIG.ttlMs,
      });

      await SecureStore.setItemAsync(`${this.STORAGE_PREFIX}${cleanDigits}`, payload);

      return {
        success: true,
        message: `OTP sent via SMS gateway to ${cleanDigits.slice(-4).padStart(cleanDigits.length, '*')}`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Direct SMS gateway delivery failed',
      };
    }
  }

  /**
   * Verifies direct Dove OTP by comparing SHA-256 hash.
   */
  public static async verifyDirectDoveOtp(mobileNumber: string, inputOtp: string): Promise<boolean> {
    const cleanDigits = mobileNumber.replace(/\D/g, '');
    const key = `${this.STORAGE_PREFIX}${cleanDigits}`;

    try {
      const stored = await SecureStore.getItemAsync(key);
      if (!stored) return false;

      const { hash, expiresAt } = JSON.parse(stored);
      if (Date.now() > expiresAt) {
        await SecureStore.deleteItemAsync(key);
        return false;
      }

      const inputHash = sha256(inputOtp.trim());
      if (inputHash === hash) {
        await SecureStore.deleteItemAsync(key);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
