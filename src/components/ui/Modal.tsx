import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' };

export function Modal({ open, onClose, title, subtitle, children, size = 'md' }: Props) {
  const backdrop = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);

  // Con el modal abierto, bloqueamos el scroll del fondo (evita el doble
  // scroll en móvil y que la página de detrás se mueva) y cerramos con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Se monta en un portal sobre <body>: así el modal escapa del contenedor de
  // contenido (que tiene su propio z-index) y no queda por debajo de la barra
  // lateral, aunque su z-50 sea mayor en número.
  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          onMouseDown={(e) => { downOnBackdrop.current = e.target === backdrop.current; }}
          onClick={(e) => { if (downOnBackdrop.current && e.target === backdrop.current) onClose(); }}
        >
          <motion.div
            ref={backdrop}
            className="absolute inset-0 bg-ink-900/50 backdrop-blur-md backdrop-saturate-150"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          />
          <motion.div
            className={`relative w-full ${sizes[size]} glass-modal rounded-t-3xl sm:rounded-3xl
                        shadow-glass flex flex-col overflow-hidden
                        max-h-[92dvh] sm:max-h-[90dvh]`}
            initial={{ opacity: 0, y: '18%', scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: '18%', scale: 0.98 }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            {/* Asa de arrastre: solo en el formato hoja inferior (móvil). */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center shrink-0">
              <span className="h-1.5 w-11 rounded-full bg-ink-300/70 dark:bg-white/25" />
            </div>

            {title && (
              <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-3 sm:px-6 sm:pt-5
                              border-b border-white/25 dark:border-white/10 shrink-0">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold truncate">{title}</h3>
                  {subtitle && <p className="text-sm text-ink-400 mt-0.5 line-clamp-2">{subtitle}</p>}
                </div>
                <button onClick={onClose} aria-label="Cerrar" className="btn-ghost !p-2 rounded-full -mr-1 shrink-0">
                  <X size={18} />
                </button>
              </div>
            )}
            <div className="overflow-y-auto overscroll-contain px-5 py-5 sm:px-6
                            [padding-bottom:calc(1.25rem+env(safe-area-inset-bottom))]">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
