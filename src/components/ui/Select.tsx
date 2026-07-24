import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Check, Search } from 'lucide-react';
import clsx from 'clsx';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
  /** Desde cuántas opciones se muestra el buscador. `false` lo desactiva. */
  buscarDesde?: number | false;
}

interface Coords {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
}

/** Sin acentos y en minúsculas, para que "bogota" encuentre "Bogotá". */
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function Select({
  value, onChange, options, placeholder, className, disabled, id, buscarDesde = 7,
}: SelectProps) {
  const { t: tr } = useTranslation();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [active, setActive] = useState(0);
  const [q, setQ] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buscarRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);
  const label = selected?.label ?? placeholder ?? '';

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

  // Al abrir con buscador, el foco va a la caja de búsqueda.
  useEffect(() => {
    if (open && conBusqueda) buscarRef.current?.focus();
  }, [open, conBusqueda]);

  // Mantener la opción activa a la vista al navegar con el teclado.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    setQ('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const cerrar = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Navegación por teclado, compartida por el disparador y la caja de búsqueda.
  const navegar = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { cerrar(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(filtradas.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const o = filtradas[active]; if (o) choose(o.value); }
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    // Con buscador el foco está en la caja; aquí solo navega el modo sin buscador.
    if (!conBusqueda) navegar(e);
  };

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx('input flex items-center justify-between gap-2 text-left', className)}
      >
        <span className={clsx('truncate', !selected && 'text-ink-400')}>{label}</span>
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
                <div className="px-3 py-4 text-sm text-ink-400 text-center">Sin resultados</div>
              )}
              {filtradas.map((o, i) => {
                const isSel = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    data-idx={i}
                    aria-selected={isSel}
                    title={o.description}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o.value)}
                    className={clsx(
                      'w-full flex items-start justify-between gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors',
                      isSel
                        ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300 font-medium'
                        : 'text-ink-700 dark:text-ink-200',
                      i === active && !isSel && 'bg-ink-100 dark:bg-white/5',
                      i === active && isSel && 'bg-brand-500/15',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">{o.label}</span>
                      {o.description && (
                        <span className="block text-xs text-ink-400 font-normal whitespace-normal leading-snug mt-0.5">
                          {o.description}
                        </span>
                      )}
                    </span>
                    {isSel && <Check size={15} className="shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
