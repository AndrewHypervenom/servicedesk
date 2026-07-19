import { motion } from 'framer-motion';
import clsx from 'clsx';
import { Inbox } from 'lucide-react';

interface Props {
  /** Ícono de lucide-react. Por defecto una bandeja vacía. */
  icon?: React.ElementType;
  title: string;
  /** Explica por qué está vacío o qué hacer para llenarlo. */
  description?: string;
  /** Acción sugerida — sin esto el estado vacío es un callejón sin salida. */
  action?: React.ReactNode;
  /** `search` se usa cuando hay filtros activos y el vacío no es el estado inicial. */
  variant?: 'default' | 'search';
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  variant = 'default',
  className,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={clsx('flex flex-col items-center justify-center text-center px-6', variant === 'search' ? 'py-12' : 'py-16', className)}
    >
      <div className="relative mb-5">
        {/* Halo suave: da peso visual sin necesitar una ilustración externa. */}
        <div className="absolute inset-0 -m-4 rounded-full bg-gradient-to-br from-brand-500/15 to-magenta-500/10 blur-xl" />
        <div className="relative w-16 h-16 rounded-2xl bg-white dark:bg-ink-800 border border-ink-100 dark:border-white/10 shadow-card grid place-items-center text-ink-300 dark:text-ink-400">
          <Icon size={28} strokeWidth={1.5} />
        </div>
      </div>

      <h3 className="font-semibold text-ink-800 dark:text-ink-100">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm text-ink-400 max-w-sm leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap gap-2 justify-center">{action}</div>}
    </motion.div>
  );
}
