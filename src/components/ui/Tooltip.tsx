import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** Acción en una o dos palabras: es lo que se lee primero. */
  label: string;
  /** Línea de apoyo opcional: qué pasa al hacer clic. */
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

interface Pos { x: number; y: number; flip: boolean }

/**
 * Tooltip propio para los botones de solo icono. El `title` nativo tarda ~1s en
 * aparecer, no se puede estilar y no se ve al navegar con teclado; este responde
 * al instante, admite una segunda línea explicativa y se muestra también al
 * enfocar con Tab.
 *
 * Se pinta en un portal con posición `fixed` porque las tablas van dentro de un
 * `overflow-x-auto`, que recortaría cualquier tooltip posicionado en el flujo.
 */
export function Tooltip({ label, hint, children, className = '' }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [pos, setPos] = useState<Pos | null>(null);

  const ubicar = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // Si arriba no cabe (primeras filas de la tabla), se voltea hacia abajo.
    const flip = r.top < 96;
    setPos({ x: r.left + r.width / 2, y: flip ? r.bottom + 8 : r.top - 8, flip });
  }, []);

  const abrir = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(ubicar, 90);
  }, [ubicar]);

  const cerrar = useCallback(() => {
    clearTimeout(timer.current);
    setPos(null);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Cualquier scroll o resize desplaza el ancla: es más honesto ocultarlo que
  // dejarlo flotando en una posición vieja.
  useEffect(() => {
    if (!pos) return;
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [pos, cerrar]);

  return (
    <>
      <span
        ref={ref}
        className={`inline-flex ${className}`}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') abrir(); }}
        onPointerLeave={cerrar}
        onPointerDown={cerrar}
        onFocusCapture={ubicar}
        onBlurCapture={cerrar}
      >
        {children}
      </span>

      {pos && createPortal(
        <div
          role="tooltip"
          style={{
            left: pos.x, top: pos.y,
            transform: `translate(-50%, ${pos.flip ? '0' : '-100%'})`,
          }}
          className="pointer-events-none fixed z-[60] max-w-[15rem] rounded-xl px-2.5 py-1.5
                     bg-ink-900 text-white shadow-lg dark:bg-ink-800
                     dark:ring-1 dark:ring-white/10"
        >
          <span className="block text-xs font-medium leading-tight">{label}</span>
          {hint && <span className="block text-[11px] leading-snug text-white/65 mt-0.5">{hint}</span>}
        </div>,
        document.body,
      )}
    </>
  );
}
