import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Check, Search } from 'lucide-react';
import clsx from 'clsx';
import type { SelectOption } from './Select';

interface MultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** Máximo de opciones marcadas. Con `1` la elección se comporta como un radio. */
  max?: number;
  /** Aviso al intentar pasarse del máximo. */
  maxHint?: string;
  /** Desde cuántas opciones se muestra el buscador. `false` lo desactiva. */
  buscarDesde?: number | false;
  /** Se llama al cerrar el panel, con la selección final: sirve para guardar. */
  onCerrar?: (values: string[]) => void;
}

interface Coords {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

/** Sin acentos y en minúsculas, para que "panama" encuentre "Panamá". */
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Igual que `Select` pero con casillas: se marcan y desmarcan varias opciones
 * sin que el panel se cierre. Se usa para asignar países a una persona.
 *
 * La selección se comunica en cada cambio (`onChange`, para que la vista se
 * actualice al instante) y, si se pasa `onCerrar`, otra vez al cerrar el panel:
 * ahí es donde conviene guardar, para no lanzar una escritura por cada clic.
 */
export function MultiSelect({
  values, onChange, options, placeholder, className, disabled, id,
  max, maxHint, buscarDesde = 7, onCerrar,
}: MultiSelectProps) {
  const { t: tr } = useTranslation();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [active, setActive] = useState(0);
  const [q, setQ] = useState('');
  const [aviso, setAviso] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buscarRef = useRef<HTMLInputElement>(null);
  // Siempre la selección más reciente para el aviso de cierre, sin re-suscribir
  // los listeners del documento en cada tecla.
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const seleccionadas = options.filter((o) => values.includes(o.value));
  const label = seleccionadas.length
    ? seleccionadas.map((o) => o.label).join(', ')
    : placeholder ?? '';

  const conBusqueda = buscarDesde !== false && options.length >= buscarDesde;

  const filtradas = useMemo(() => {
    if (!conBusqueda || !q.trim()) return options;
    const t = norm(q);
    return options.filter((o) => norm(o.label).includes(t) || (o.description && norm(o.description).includes(t)));
  }, [options, q, conBusqueda]);

  const place = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const below = window.innerHeight - r.bottom;
    const flip = below < 240 && r.top > below;
    setCoords(
      flip
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + gap }
        : { left: r.left, width: r.width, top: r.bottom + gap },
    );
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (open && conBusqueda) buscarRef.current?.focus();
  }, [open, conBusqueda]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const cerrarPanel = () => {
    setOpen(false);
    setAviso(false);
    onCerrar?.(valuesRef.current);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) cerrarPanel();
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      cerrarPanel();
    };
    const onResize = () => cerrarPanel();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    setQ('');
    setAviso(false);
    setActive(Math.max(0, options.findIndex((o) => values.includes(o.value))));
    setOpen(true);
  };

  const cerrarConFoco = () => {
    cerrarPanel();
    triggerRef.current?.focus();
  };

  const alternar = (v: string) => {
    const on = values.includes(v);
    if (on) {
      onChange(values.filter((x) => x !== v));
      setAviso(false);
      return;
    }
    // Con máximo 1 la nueva reemplaza a la anterior: pedir que desmarquen antes
    // sería un paso de más para lo que se lee como un radio.
    if (max === 1) {
      onChange([v]);
      setAviso(false);
      return;
    }
    if (max && values.length >= max) { setAviso(true); return; }
    onChange([...values, v]);
    setAviso(false);
  };

  const navegar = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { cerrarConFoco(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(filtradas.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const o = filtradas[active];
      if (o) alternar(o.value);
    }
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (!conBusqueda) navegar(e);
  };

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        disabled={disabled}
        onClick={() => (open ? cerrarConFoco() : openMenu())}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx('input flex items-center justify-between gap-2 text-left', className)}
      >
        <span className={clsx('truncate', !seleccionadas.length && 'text-ink-400')}>{label}</span>
        <ChevronDown
          size={16}
          className={clsx('shrink-0 text-ink-400 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && coords &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-multiselectable
            style={{
              position: 'fixed',
              left: coords.left,
              top: coords.top,
              bottom: coords.bottom,
              minWidth: coords.width,
            }}
            className="z-[200] max-w-[min(90vw,22rem)] card p-1 flex flex-col max-h-72 animate-slide-up shadow-card-hover"
          >
            {conBusqueda && (
              <div className="p-1 pb-1.5 sticky top-0">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
                  <input
                    ref={buscarRef}
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setActive(0); }}
                    onKeyDown={navegar}
                    placeholder={`${tr('common.search')}…`}
                    className="input !py-1.5 !pl-8 !text-sm w-full"
                    aria-label={tr('common.search')}
                  />
                </div>
              </div>
            )}

            <div className="overflow-auto">
              {filtradas.length === 0 && (
                <div className="px-3 py-4 text-sm text-ink-400 text-center">{tr('common.noResultsTitle')}</div>
              )}
              {filtradas.map((o, i) => {
                const isSel = values.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    data-idx={i}
                    aria-selected={isSel}
                    title={o.description}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => alternar(o.value)}
                    className={clsx(
                      'w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                      isSel
                        ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300 font-medium'
                        : 'text-ink-700 dark:text-ink-200',
                      i === active && !isSel && 'bg-ink-100 dark:bg-white/5',
                      i === active && isSel && 'bg-brand-500/15',
                    )}
                  >
                    <span
                      aria-hidden
                      className={clsx(
                        'w-[18px] h-[18px] mt-px rounded-md grid place-items-center shrink-0 border transition-colors',
                        isSel ? 'bg-brand-500 border-brand-500 text-white' : 'border-ink-300 dark:border-white/20',
                      )}
                    >
                      {isSel && <Check size={12} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.description && (
                        <span className="block text-xs text-ink-400 font-normal whitespace-normal leading-snug mt-0.5">
                          {o.description}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {aviso && maxHint && (
              <div className="px-3 py-2 text-xs text-amber-600 dark:text-warning border-t border-ink-100 dark:border-white/5">
                {maxHint}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
