import { diasRestantes } from '@/lib/format';
import type { Equipo, EstadoAsignacion, EstadoFisico } from '@/types';

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

/**
 * Si un equipo se puede entregar según su condición física.
 *
 * El estado de asignación dice si el equipo está libre; el físico dice si está
 * en condiciones de trabajar, y son cosas distintas: un portátil dañado sigue
 * marcado como DISPONIBLE en bodega, y hasta ahora nada impedía entregarlo. Un
 * equipo dañado o de baja no se entrega —el camino es mantenimiento—, y uno con
 * falla conocida se puede entregar, pero avisando y dejándolo por escrito.
 */
export type AptitudEntrega = 'APTO' | 'ADVERTENCIA' | 'BLOQUEADO';

export function aptitudEntrega(fisico: EstadoFisico): AptitudEntrega {
  switch (fisico) {
    case 'DANADO':
    case 'DE_BAJA': return 'BLOQUEADO';
    case 'CON_FALLA': return 'ADVERTENCIA';
    default: return 'APTO'; // BUENO, REGULAR
  }
}

/** Atajo para filtrar: ¿este equipo se puede poner en un acta de entrega? */
export function esEntregable(fisico: EstadoFisico): boolean {
  return aptitudEntrega(fisico) !== 'BLOQUEADO';
}

// ── Contrato ────────────────────────────────────────────────────────────────
// Un equipo rentado o en comodato no es nuestro: lo tenemos mientras el
// contrato esté vigente. Vencido el contrato, el equipo se devuelve o se
// renueva; entregárselo a alguien más lo deja circulando sin respaldo y
// convierte la devolución al proveedor en una cacería.

/** Datos mínimos para razonar sobre el contrato: sirve para equipos parciales. */
export type ConContrato = Pick<Equipo, 'propiedad' | 'fecha_vencimiento_contrato'>;

/** Solo lo que no es de la empresa se rige por un contrato con fecha de fin. */
export function tieneContrato(e: ConContrato): boolean {
  return e.propiedad === 'RENTADO' || e.propiedad === 'COMODATO';
}

/**
 * Días que le quedan al contrato: negativo si ya venció, `null` si el equipo no
 * tiene contrato o no se le registró la fecha (no se puede afirmar que venció).
 */
export function diasDeContrato(e: ConContrato): number | null {
  if (!tieneContrato(e)) return null;
  return diasRestantes(e.fecha_vencimiento_contrato);
}

/** El contrato terminó: el equipo ya no debería seguir circulando. */
export function contratoVencido(e: ConContrato): boolean {
  const d = diasDeContrato(e);
  return d !== null && d < 0;
}

/** El contrato sigue vigente pero se acaba dentro de `dias`. */
export function contratoPorVencer(e: ConContrato, dias = 30): boolean {
  const d = diasDeContrato(e);
  return d !== null && d >= 0 && d <= dias;
}

/**
 * Por qué un equipo no se puede entregar, o `null` si sí se puede.
 *
 * Son dos razones con salidas distintas —el daño se arregla en mantenimiento,
 * el contrato lo renueva (o cierra) el área de contratos—, así que quien
 * pregunta necesita saber cuál de las dos es.
 */
export type MotivoNoEntregable = 'FISICO' | 'CONTRATO';

export function motivoNoEntregable(e: Equipo): MotivoNoEntregable | null {
  if (aptitudEntrega(e.estado_fisico) === 'BLOQUEADO') return 'FISICO';
  if (contratoVencido(e)) return 'CONTRATO';
  return null;
}
