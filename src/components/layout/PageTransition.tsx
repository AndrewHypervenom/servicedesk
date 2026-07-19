import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Envoltorio de entrada/salida para cada ruta.
 *
 * La salida es más corta que la entrada (0.18s vs 0.4s) y ambas se solapan en
 * `mode="wait"` del AnimatePresence padre: si duraran lo mismo, navegar se
 * sentiría el doble de lento de lo que realmente tarda.
 *
 * El desplazamiento es de 8px, no de 24px. En una pantalla de trabajo que se
 * usa muchas veces al día, un recorrido largo pasa de "elegante" a "molesto"
 * a la tercera navegación.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{
        opacity: 0,
        ...(reduce ? {} : { y: -6 }),
        transition: { duration: 0.18, ease: [0.4, 0, 1, 1] },
      }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
