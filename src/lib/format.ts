import { format, differenceInDays, parseISO } from 'date-fns';
import { es, ptBR } from 'date-fns/locale';

export function fmtDate(d?: string | null, lng = 'es'): string {
  if (!d) return '—';
  try {
    return format(parseISO(d), 'dd MMM yyyy', { locale: lng === 'pt' ? ptBR : es });
  } catch {
    return d;
  }
}

export function diasRestantes(d?: string | null): number | null {
  if (!d) return null;
  try { return differenceInDays(parseISO(d), new Date()); } catch { return null; }
}

export function excelSerialToDate(serial: number | string): string | null {
  const n = typeof serial === 'string' ? parseFloat(serial) : serial;
  if (!n || Number.isNaN(n)) return null;
  const epoch = new Date(Date.UTC(1899, 11, 30));
  epoch.setUTCDate(epoch.getUTCDate() + Math.floor(n));
  return epoch.toISOString().slice(0, 10);
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}
