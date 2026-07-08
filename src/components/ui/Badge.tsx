import clsx from 'clsx';
import type { EstadoAsignacion, EstadoFisico } from '@/types';

const estadoColors: Record<EstadoAsignacion, string> = {
  DISPONIBLE: 'bg-success/15 text-emerald-700 dark:text-success',
  ASIGNADO: 'bg-brand-500/15 text-brand-600 dark:text-brand-300',
  EN_MANTENIMIENTO: 'bg-warning/15 text-amber-600 dark:text-warning',
  EN_DEVOLUCION: 'bg-info/20 text-magenta-600 dark:text-info',
  DE_BAJA: 'bg-ink-300/20 text-ink-500 dark:text-ink-300',
};

const fisicoColors: Record<EstadoFisico, string> = {
  BUENO: 'bg-success/15 text-emerald-700 dark:text-success',
  REGULAR: 'bg-warning/15 text-amber-600 dark:text-warning',
  DANADO: 'bg-danger/15 text-red-600 dark:text-danger',
  DE_BAJA: 'bg-ink-300/20 text-ink-500 dark:text-ink-300',
};

export function EstadoBadge({ estado, label }: { estado: EstadoAsignacion; label: string }) {
  return <span className={clsx('badge', estadoColors[estado])}>
    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />{label}
  </span>;
}

export function FisicoBadge({ estado, label }: { estado: EstadoFisico; label: string }) {
  return <span className={clsx('badge', fisicoColors[estado])}>{label}</span>;
}

export function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={clsx('badge bg-ink-100 dark:bg-ink-700 text-ink-600 dark:text-ink-200', className)}>{children}</span>;
}
