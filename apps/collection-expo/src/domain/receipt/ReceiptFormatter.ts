import { CollectionReceipt } from '../../types';

const LINE_WIDTH = 40;

function sha256Hex(ascii: string): string {
  // Use Node.js crypto if present
  try {
    const crypto = require('crypto');
    if (crypto && typeof crypto.createHash === 'function') {
      return crypto.createHash('sha256').update(ascii).digest('hex');
    }
  } catch (_e) {}

  // Pure JavaScript SHA-256 fallback (RFC 6234 standard)
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = candidate * 2; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength | 0;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const s0 =
        i >= 16
          ? rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)
          : 0;
      const s1 =
        i >= 16
          ? rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10)
          : 0;

      if (i >= 16) {
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }

      const s0Maj =
        rightRotate(hash[0], 2) ^
        rightRotate(hash[0], 13) ^
        rightRotate(hash[0], 22);
      const maj =
        (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const t2 = (s0Maj + maj) | 0;

      const s1Ch =
        rightRotate(hash[4], 6) ^
        rightRotate(hash[4], 11) ^
        rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const t1 = (hash[7] + s1Ch + ch + k[i] + w[i]) | 0;

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + t1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (t1 + t2) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

export class ReceiptFormatter {
  static generateReceiptText(receipt: CollectionReceipt): string {
    const lines: string[] = [];
    const sep = '='.repeat(LINE_WIDTH);
    const dash = '-'.repeat(LINE_WIDTH);

    lines.push(this.centerText('DFARM DAIRY COLLECTION', LINE_WIDTH));
    lines.push(this.centerText(receipt.centerName.toUpperCase(), LINE_WIDTH));
    lines.push(sep);

    lines.push(this.formatRow(`Date: ${receipt.businessDate}`, `Shift: ${receipt.shift}`));
    const dateObj = new Date(receipt.timestamp);
    const timeStr = [
      String(dateObj.getHours()).padStart(2, '0'),
      String(dateObj.getMinutes()).padStart(2, '0'),
      String(dateObj.getSeconds()).padStart(2, '0'),
    ].join(':');
    lines.push(this.formatRow(`Time: ${timeStr}`, `Rcpt: ${receipt.receiptNumber}`));
    lines.push(dash);

    lines.push(this.formatRow('Farmer Code:', receipt.customerCode));
    lines.push(this.formatRow('Customer:', this.maskName(receipt.customerName)));
    lines.push(this.formatRow('Auth Method:', receipt.identificationMethod));
    lines.push(dash);

    lines.push(this.formatRow('Category:', receipt.milkCategory));
    lines.push(this.formatRow('Net Weight:', `${receipt.weightKg.toFixed(2)} kg`));
    lines.push(this.formatRow('Fat %:', `${receipt.fatPercentage.toFixed(1)} %`));
    lines.push(this.formatRow('SNF %:', `${receipt.snfPercentage.toFixed(1)} %`));
    lines.push(this.formatRow('Rate / kg:', `INR ${receipt.ratePerUnit.toFixed(2)}`));
    lines.push(dash);

    lines.push(this.formatRow('TOTAL AMOUNT:', `INR ${receipt.totalAmount.toFixed(2)}`));
    lines.push(sep);

    lines.push(`Session: ${receipt.sessionUuid.slice(0, 18)}...`);
    lines.push(`Operator: ${receipt.operatorName}`);
    lines.push(`Hash: ${receipt.verificationHash.slice(0, 16)}...`);
    lines.push(this.centerText('*** THANK YOU ***', LINE_WIDTH));

    return lines.join('\n') + '\n';
  }

  static computeVerificationHash(receipt: CollectionReceipt): string {
    const payload = `${receipt.sessionUuid}|${receipt.customerCode}|${receipt.weightKg}|${receipt.totalAmount}|${receipt.timestamp}`;
    return sha256Hex(payload);
  }

  static centerText(text: string, width: number): string {
    if (text.length >= width) return text.slice(0, width);
    const pad = Math.floor((width - text.length) / 2);
    return ' '.repeat(pad) + text;
  }

  static formatRow(left: string, right: string): string {
    const available = LINE_WIDTH - left.length - right.length;
    if (available > 0) {
      return left + ' '.repeat(available) + right;
    }
    return `${left} ${right}`;
  }

  static maskName(name: string): string {
    const parts = name.split(' ');
    return parts
      .map((p) => (p.length > 2 ? `${p.slice(0, 2)}${'*'.repeat(p.length - 2)}` : p))
      .join(' ');
  }
}
