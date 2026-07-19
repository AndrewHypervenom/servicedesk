import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { SkeletonRows } from './Skeleton';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Devolver el valor a comparar habilita el ordenamiento de esa columna. */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  headerClassName?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Se renderiza cuando no hay filas y no está cargando (un <EmptyState/>). */
  empty?: React.ReactNode;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
  /** Barra flotante de acciones masivas; recibe las filas seleccionadas. */
  bulkActions?: (rows: T[], clear: () => void) => React.ReactNode;
  /** Alto máximo del área desplazable — lo que hace útil el header sticky. */
  maxHeight?: string;
  skeletonRows?: number;
}

type Dir = 'asc' | 'desc';

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  empty,
  selectable = false,
  selected,
  onSelectedChange,
  bulkActions,
  maxHeight = 'calc(100vh - 340px)',
  skeletonRows = 8,
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: Dir } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    // Copia antes de ordenar: `rows` suele venir memoizado desde el padre.
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      // Los vacíos siempre al final, sin importar la dirección.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * factor;
    });
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));
  };

  const sel = selected ?? new Set<string>();
  const visibleKeys = sorted.map(rowKey);
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => sel.has(k));
  const someSelected = visibleKeys.some((k) => sel.has(k));

  const toggleAll = () => {
    const next = new Set(sel);
    // Actúa solo sobre lo visible: no debe borrar selección oculta por filtros.
    if (allSelected) visibleKeys.forEach((k) => next.delete(k));
    else visibleKeys.forEach((k) => next.add(k));
    onSelectedChange?.(next);
  };

  const toggleOne = (key: string) => {
    const next = new Set(sel);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedChange?.(next);
  };

  const clear = () => onSelectedChange?.(new Set());
  const selectedRows = rows.filter((r) => sel.has(rowKey(r)));
  const colCount = columns.length + (selectable ? 1 : 0);

  return (
    <>
      <div className="card overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight }}>
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-400">
                {selectable && (
                  <th className="sticky top-0 z-20 bg-white/95 dark:bg-ink-800/95 backdrop-blur-md border-b border-ink-100 dark:border-white/10 px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded accent-brand-500 cursor-pointer"
                    />
                  </th>
                )}
                {columns.map((c) => {
                  const active = sort?.key === c.key;
                  const sortable = !!c.sortValue;
                  return (
                    <th
                      key={c.key}
                      aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      className={clsx(
                        'sticky top-0 z-20 bg-white/95 dark:bg-ink-800/95 backdrop-blur-md',
                        'border-b border-ink-100 dark:border-white/10 px-4 py-3 font-semibold',
                        c.headerClassName,
                      )}
                    >
                      {sortable ? (
                        <button
                          onClick={() => toggleSort(c.key)}
                          className={clsx(
                            'inline-flex items-center gap-1.5 uppercase tracking-wide transition-colors',
                            active ? 'text-brand-600 dark:text-brand-300' : 'hover:text-ink-600 dark:hover:text-ink-200',
                          )}
                        >
                          {c.header}
                          {active
                            ? (sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                            : <ChevronsUpDown size={12} className="opacity-40" />}
                        </button>
                      ) : c.header}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && <SkeletonRows rows={skeletonRows} cols={colCount} />}

              {!loading && sorted.map((row, i) => {
                const key = rowKey(row);
                const isSel = sel.has(key);
                return (
                  <motion.tr
                    key={key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.015, 0.25) }}
                    className={clsx(
                      'border-b border-ink-50 dark:border-white/5',
                      // Solo color y sombra: un `transform` en <tr> se comporta
                      // de forma dispar entre navegadores y descoloca tanto los
                      // bordes de celda como el header sticky.
                      'transition-[background-color,box-shadow] duration-150',
                      isSel
                        ? 'bg-brand-500/[0.07] shadow-[inset_3px_0_0_0_theme(colors.brand.500)]'
                        : 'hover:bg-ink-50/60 dark:hover:bg-white/5 hover:shadow-[inset_3px_0_0_0_theme(colors.brand.500/0.35)]',
                    )}
                  >
                    {selectable && (
                      <td className="px-4 py-3 border-b border-ink-50 dark:border-white/5">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleOne(key)}
                          className="w-4 h-4 rounded accent-brand-500 cursor-pointer"
                        />
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key} className={clsx('px-4 py-3 border-b border-ink-50 dark:border-white/5', c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>

          {!loading && sorted.length === 0 && empty}
        </div>
      </div>

      <AnimatePresence>
        {selectedRows.length > 0 && bulkActions && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 340 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 glass rounded-2xl shadow-glass px-4 py-3 flex items-center gap-3"
          >
            <span className="text-sm font-semibold whitespace-nowrap">
              {selectedRows.length} <span className="font-normal text-ink-400">seleccionado{selectedRows.length > 1 ? 's' : ''}</span>
            </span>
            <div className="w-px h-6 bg-ink-200 dark:bg-white/10" />
            {bulkActions(selectedRows, clear)}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
