/**
 * Buscador reutilizable con el diseño de Colaboradores: ícono a la izquierda,
 * botón de limpiar animado y atajo "/" para saltar al campo desde cualquier
 * parte de la pantalla. Se extrajo para que Actas, Proveedores, Sedes y demás
 * listados usen exactamente la misma barra, sin copiar el markup en cada vista.
 */
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Habilita el atajo "/" para enfocar el buscador. Activado por defecto. */
  atajo?: boolean;
  className?: string;
  autoFocus?: boolean;
};

export function SearchInput({ value, onChange, placeholder, atajo = true, className = '', autoFocus }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!atajo) return;
    const onKey = (e: KeyboardEvent) => {
      const dentroDeCampo = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '');
      if (e.key === '/' && !dentroDeCampo) { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [atajo]);

  return (
    <div className={`relative flex-1 min-w-0 ${className}`}>
      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" />
      <input
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('common.search')}
        className="input pl-10 pr-16"
      />
      <AnimatePresence>
        {value && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => { onChange(''); ref.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-ink-400 hover:bg-ink-100 dark:hover:bg-white/10"
            aria-label={t('common.clear')}
          >
            <X size={14} />
          </motion.button>
        )}
      </AnimatePresence>
      {atajo && !value && (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:block text-[10px] font-mono text-ink-400 border border-ink-200 dark:border-white/10 rounded px-1.5 py-0.5">
          /
        </kbd>
      )}
    </div>
  );
}
