/**
 * Lectura del "ESTATUS INTERNO" que trae la base de Talento Humano.
 *
 * La columna es texto libre con nueve variantes ("RENUNCIA VOLUNTARIA",
 * "INACTIVO SIN JUSTA CAUSA", "FINALIZACION PRODUCTIVA"…) y todas menos una
 * significan lo mismo para el Service Desk: esa persona ya no debería recibir
 * equipos. Aquí se traduce ese texto a algo con lo que la interfaz pueda
 * trabajar sin repetir la lista en cada pantalla.
 */

import i18n from '@/i18n';
import { normNombre } from '@/lib/importador/normalizar';

/** El único estatus que deja a la persona en la planta activa. */
export const ESTATUS_ACTIVO = 'ACTIVO';

/** ¿Este estatus corresponde a alguien que sigue vinculado? */
export function esEstatusActivo(estatus?: string | null): boolean {
  return normNombre(estatus) === ESTATUS_ACTIVO;
}

/** Clases del badge según el estatus: verde para activo, gris para los retiros. */
export function colorEstatus(estatus?: string | null): string {
  if (!estatus) return 'bg-ink-100 dark:bg-white/10 text-ink-500 dark:text-ink-300';
  if (esEstatusActivo(estatus)) return 'bg-success/15 text-emerald-700 dark:text-success';
  const n = normNombre(estatus);
  // Los retiros por decisión de la empresa se distinguen de la renuncia: no es
  // decoración, es lo primero que se pregunta al auditar una devolución.
  if (n.includes('JUSTA CAUSA') || n.includes('TERMINACION')) return 'bg-danger/12 text-red-600 dark:text-danger';
  if (n.includes('RENUNCIA')) return 'bg-warning/15 text-amber-600 dark:text-warning';
  return 'bg-ink-300/20 text-ink-500 dark:text-ink-300';
}

/** "RENUNCIA VOLUNTARIA" -> "Renuncia voluntaria". Para no gritar en la tarjeta. */
export function estatusLegible(estatus?: string | null): string {
  const n = normNombre(estatus);
  if (!n) return '—';
  return n.charAt(0) + n.slice(1).toLowerCase();
}

/** Años y meses desde el ingreso. `null` si no hay fecha o es futura. */
export function antiguedad(fechaIngreso?: string | null): { anios: number; meses: number } | null {
  if (!fechaIngreso) return null;
  const d = new Date(fechaIngreso);
  if (Number.isNaN(d.getTime())) return null;
  const hoy = new Date();
  let meses = (hoy.getFullYear() - d.getFullYear()) * 12 + (hoy.getMonth() - d.getMonth());
  if (hoy.getDate() < d.getDate()) meses -= 1;
  if (meses < 0) return null;
  return { anios: Math.floor(meses / 12), meses: meses % 12 };
}

export function antiguedadTexto(fechaIngreso?: string | null): string {
  const a = antiguedad(fechaIngreso);
  if (!a) return '—';
  const anios = i18n.t('time.years', { count: a.anios });
  const meses = i18n.t('time.months', { count: a.meses });
  if (a.anios === 0) return meses;
  if (a.meses === 0) return anios;
  return i18n.t('time.yearsMonths', { years: anios, months: meses });
}
