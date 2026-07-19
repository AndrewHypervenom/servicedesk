import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, FileSpreadsheet, Loader2 } from 'lucide-react';

/**
 * El barrido que se ve mientras el archivo se analiza.
 *
 * El análisis real de 6 hojas tarda unos milisegundos, así que la animación no
 * refleja trabajo pendiente: existe para que el usuario alcance a leer qué hoja
 * se está mirando y no sienta que el resultado apareció de la nada. Por eso el
 * paso corre con su propio reloj y el resultado se muestra cuando ambos terminan.
 */

const PASOS = [
  { hoja: 'BD_EQUIPOS', detalle: 'Leyendo seriales, marcas y estados' },
  { hoja: 'ENTRADAS', detalle: 'Cruzando cédulas y devoluciones' },
  { hoja: 'SALIDAS', detalle: 'Reconstruyendo asignaciones' },
  { hoja: 'CONFIGURACIÓN', detalle: 'Validando contra los catálogos' },
  { hoja: 'DASHBOARD', detalle: 'Descartando hojas sin datos' },
  { hoja: 'Consolidando', detalle: 'Detectando conflictos y datos dudosos' },
];

const MS_POR_PASO = 420;

export function duracionAnimacion() {
  return PASOS.length * MS_POR_PASO;
}

export function AnalisisVisual({ nombreArchivo }: { nombreArchivo: string }) {
  const [activo, setActivo] = useState(0);

  useEffect(() => {
    if (activo >= PASOS.length) return;
    const t = setTimeout(() => setActivo((n) => n + 1), MS_POR_PASO);
    return () => clearTimeout(t);
  }, [activo]);

  return (
    <div className="py-4">
      {/* Documento con el haz de escaneo recorriéndolo */}
      <div className="relative mx-auto w-40 h-48 mb-8">
        <motion.div
          className="absolute inset-0 rounded-2xl border border-ink-200 dark:border-white/10 bg-white dark:bg-ink-800 overflow-hidden shadow-card"
          animate={{ rotateY: [0, 4, 0, -4, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="p-4 space-y-2">
            <FileSpreadsheet className="text-brand-500 mb-3" size={26} />
            {[...Array(7)].map((_, i) => (
              <motion.div
                key={i}
                className="h-1.5 rounded-full bg-ink-100 dark:bg-white/10"
                style={{ width: `${55 + ((i * 37) % 45)}%` }}
                animate={{ opacity: [0.35, 1, 0.35] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }}
              />
            ))}
          </div>

          {/* El haz */}
          <motion.div
            className="absolute left-0 right-0 h-16 pointer-events-none"
            style={{
              background: 'linear-gradient(180deg, transparent, rgba(16,212,81,0.28), transparent)',
            }}
            animate={{ top: ['-15%', '100%'] }}
            transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute left-0 right-0 h-px bg-brand-500 shadow-[0_0_12px_2px_rgba(16,212,81,0.8)] pointer-events-none"
            animate={{ top: ['0%', '100%'] }}
            transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        {/* Halo corporativo detrás del documento */}
        <motion.div
          className="absolute -inset-6 -z-10 rounded-full blur-2xl"
          style={{ background: 'radial-gradient(circle, rgba(16,212,81,0.22), rgba(179,61,158,0.12) 60%, transparent 70%)' }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0.95, 0.6] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <p className="text-center text-sm text-ink-400 mb-6 truncate px-4" title={nombreArchivo}>
        {nombreArchivo}
      </p>

      {/* Bitácora de hojas */}
      <div className="max-w-sm mx-auto space-y-1.5">
        {PASOS.map((p, i) => {
          const estado = i < activo ? 'listo' : i === activo ? 'activo' : 'espera';
          return (
            <motion.div
              key={p.hoja}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: estado === 'espera' ? 0.35 : 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-3 px-3 py-2 rounded-xl"
              style={estado === 'activo' ? { background: 'rgba(16,212,81,0.08)' } : undefined}
            >
              <span className="w-4 h-4 shrink-0 grid place-items-center">
                <AnimatePresence mode="wait">
                  {estado === 'listo' ? (
                    <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <Check size={14} className="text-brand-500" />
                    </motion.span>
                  ) : estado === 'activo' ? (
                    <motion.span key="go" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <Loader2 size={14} className="text-brand-500 animate-spin" />
                    </motion.span>
                  ) : (
                    <span key="wait" className="w-1.5 h-1.5 rounded-full bg-ink-300" />
                  )}
                </AnimatePresence>
              </span>
              <span className="text-sm font-medium tabular-nums">{p.hoja}</span>
              <span className="text-xs text-ink-400 truncate ml-auto">{p.detalle}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
