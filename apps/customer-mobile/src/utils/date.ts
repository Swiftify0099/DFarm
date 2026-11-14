/**
 * Date and Shift Utilities for DFarm Customer Mobile
 */

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
      return String(dateString).slice(0, 10);
    }
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(dateString);
  }
}

export const formatDateShort = formatDate;

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) {
      return String(dateString);
    }
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return String(dateString);
  }
}

export function formatShift(shift: string | null | undefined): string {
  if (!shift) return '-';
  const s = shift.toUpperCase();
  if (s === 'MORNING') return 'Morning (AM)';
  if (s === 'EVENING') return 'Evening (PM)';
  return shift;
}

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
