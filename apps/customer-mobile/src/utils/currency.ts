/**
 * Currency Utility for DFarm Mobile
 * Strictly formats server-authoritative currency values.
 * NEVER computes financial balances on client float arithmetic.
 */

export function formatINR(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return '₹ 0.00';
  }

  const num = Number(amount);
  const isNegative = num < 0;
  const absVal = Math.abs(num);

  const parts = absVal.toFixed(2).split('.');
  const integerPart = parts[0] || '0';
  const decimalPart = parts[1] || '00';

  // Indian number system formatting: last 3 digits, then groups of 2 digits
  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

  return `${isNegative ? '-' : ''}₹ ${formattedInteger}.${decimalPart}`;
}

export const formatCurrency = formatINR;

export type BalanceStatus = 'DAIRY_OWES_CUSTOMER' | 'CUSTOMER_OWES_DAIRY' | 'SETTLED';

export function getBalanceStatus(balance: number): {
  status: BalanceStatus;
  label: string;
  sublabel: string;
  type: 'credit' | 'debit' | 'settled';
} {
  if (balance > 0.00) {
    return {
      status: 'DAIRY_OWES_CUSTOMER',
      label: 'Dairy Owes You',
      sublabel: 'Payable balance credit',
      type: 'credit',
    };
  } else if (balance < 0.00) {
    return {
      status: 'CUSTOMER_OWES_DAIRY',
      label: 'You Owe Dairy',
      sublabel: 'Outstanding debit / recovery',
      type: 'debit',
    };
  } else {
    return {
      status: 'SETTLED',
      label: 'Account Settled',
      sublabel: 'Zero outstanding balance',
      type: 'settled',
    };
  }
}

export const getBalanceStatusLabel = getBalanceStatus;
