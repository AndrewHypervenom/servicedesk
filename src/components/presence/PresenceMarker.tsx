import { useActividad } from '@/lib/presence/hooks';
import type { ModoActividad, RefRecurso } from '@/lib/presence/tipos';

/**
 * Declara presencia sobre UN recurso sin pintar nada. Útil en pantallas de
 * multi-selección (devolución, asignación) donde hay varios recursos abiertos a
 * la vez: se renderiza uno por ítem y cada uno empuja su propia actividad a la
 * pila (el payload publica todas, no solo la principal).
 */
export function PresenceMarker({ mode = 'edit', ...ref }: RefRecurso & { mode?: ModoActividad }) {
  useActividad(ref, mode);
  return null;
}
