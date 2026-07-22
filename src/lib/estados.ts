import type { EstadoAsignacion } from '@/types';

/**
 * Estados de asignación a los que se puede pasar un equipo de forma manual
 * desde su estado actual.
 *
 * ASIGNADO y EN_DEVOLUCION quedan fuera a propósito: esos cambios pasan por el
 * flujo de asignación/devolución (con acta), no se ponen a mano, para no dejar
 * equipos "asignados" sin respaldo. Por eso desde ASIGNADO/EN_DEVOLUCION no se
 * ofrece ninguna transición aquí.
 */
export function transicionesEstado(actual: EstadoAsignacion): EstadoAsignacion[] {
  switch (actual) {
    case 'DISPONIBLE': return ['EN_MANTENIMIENTO', 'DE_BAJA'];
    case 'EN_MANTENIMIENTO': return ['DISPONIBLE', 'DE_BAJA'];
    case 'DE_BAJA': return ['DISPONIBLE'];
    default: return []; // ASIGNADO, EN_DEVOLUCION → van por Asignar/Devolución
  }
}

/** Si el equipo se puede mover de estado a mano desde su estado actual. */
export function puedeCambiarEstado(actual: EstadoAsignacion): boolean {
  return transicionesEstado(actual).length > 0;
}

/** Movimiento que corresponde a un cambio manual de estado. */
export function tipoMovimientoEstado(estado: EstadoAsignacion): 'BAJA' | 'MANTENIMIENTO' {
  return estado === 'DE_BAJA' ? 'BAJA' : 'MANTENIMIENTO';
}
