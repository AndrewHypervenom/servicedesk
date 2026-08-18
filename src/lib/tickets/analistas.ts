/**
 * Quién puede figurar como analista de un ticket.
 *
 * La regla vive en la base, en la función `analistas_de_mesa()` (ver la
 * migración supabase/migrations/20260818_analistas_de_mesa.sql): descarta a los
 * administradores, las cuentas de servicio y las bajas. Aquí solo se separa lo
 * que se puede ELEGIR de lo que se puede LEER, que no es lo mismo:
 *
 *   · Para elegir, la lista corta: a quién se le puede atribuir un trabajo hoy.
 *   · Para leer, la lista entera: un ticket enlazado con alguien que después
 *     pasó a ADMIN o se dio de baja tiene que seguir diciendo de quién era.
 *
 * No se filtra por `Perfil` en el navegador porque el Líder de sede no puede
 * leer la tabla `perfiles` —su RLS no se lo permite— y le saldría una lista
 * vacía. Por eso el directorio llega por esa función y no por `listPerfiles`.
 */

import type { AnalistaMesa } from '@/types';

/** Los que hoy pueden atender tickets: la lista del desplegable. */
export const seleccionables = (l: AnalistaMesa[]): AnalistaMesa[] =>
  l.filter((a) => a.seleccionable);

/** Resuelve un id a su nombre. Sobre la lista ENTERA, no sobre la corta. */
export function nombrePorId(l: AnalistaMesa[]): (id?: string | null) => string | null {
  const m = new Map(l.map((a) => [a.id, a.nombre]));
  return (id) => (id ? m.get(id) ?? null : null);
}
