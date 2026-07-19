import clsx from 'clsx';

/**
 * Bloque base de carga. Usa la clase `.skeleton` (shimmer definido en index.css)
 * para que el brillo quede sincronizado entre todos los bloques de la pantalla.
 */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={clsx('skeleton', className)} style={style} />;
}

/** Varias líneas de texto; la última sale más corta para simular un párrafo real. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={clsx('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={clsx('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

/** Réplica de las stat cards del Dashboard. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5">
          <Skeleton className="w-10 h-10 rounded-xl mb-3" />
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Filas de tabla con el mismo alto que las reales, para que no salte el layout. */
export function SkeletonRows({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-ink-50 dark:border-white/5">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3.5">
              <Skeleton className={clsx('h-3.5', c === 0 ? 'w-40' : c === cols - 1 ? 'w-12' : 'w-24')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Lista de tarjetas — la vista móvil de Inventario y varias páginas de listado. */
export function SkeletonCards({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={clsx('space-y-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 flex items-center gap-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Grilla de tarjetas con avatar — Colaboradores, Proveedores. */
export function SkeletonGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={clsx('grid sm:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="w-11 h-11 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <SkeletonText lines={3} />
        </div>
      ))}
    </div>
  );
}

/** Lista compacta de filas — paneles de Sedes/Países. */
export function SkeletonList({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={clsx('space-y-2', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 p-2.5 rounded-xl bg-ink-50 dark:bg-white/5">
          <Skeleton className="w-4 h-4 rounded shrink-0" />
          <Skeleton className="h-3 flex-1 max-w-[60%]" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder para los gráficos de Recharts. */
export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={clsx('h-56 flex items-end gap-2 px-2 pb-2', className)}>
      {[45, 70, 35, 85, 55, 65, 40].map((h, i) => (
        <Skeleton key={i} className="flex-1 rounded-t-lg" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}
