import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, useSpring, useReducedMotion } from 'framer-motion';

/**
 * Cifra que sube desde 0 hasta su valor al montarse.
 *
 * Se anima un motion value y se formatea con `useTransform`, en lugar de
 * guardar el número intermedio en estado: con estado, cada fotograma sería un
 * re-render de React: ~60 por segundo y por tarjeta. Así el DOM se toca
 * directamente y React solo renderiza una vez.
 */
export function NumeroAnimado({
  value,
  duration = 1.1,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);

  // Muelle sobreamortiguado: llega y se detiene, sin rebotar. Un contador que
  // se pasa de su valor y vuelve parece un error de cálculo, no una animación.
  const spring = useSpring(mv, { damping: 30, stiffness: 90, duration });
  const texto = useTransform(spring, (v) => Math.round(v).toLocaleString('es-CO'));

  useEffect(() => {
    if (reduce) mv.jump(value);
    else mv.set(value);
  }, [value, mv, reduce]);

  // Con movimiento reducido no se anima, pero se mantiene el mismo formato de
  // miles para que no baile el ancho entre modos.
  if (reduce) return <span className={className}>{value.toLocaleString('es-CO')}</span>;

  return <motion.span className={className}>{texto}</motion.span>;
}
