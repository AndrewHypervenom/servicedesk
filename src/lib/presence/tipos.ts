import type { RolUsuario } from '@/types';

/** Cómo se relaciona una persona con un recurso: lo edita o solo lo consulta. */
export type ModoActividad = 'edit' | 'view';

/** Referencia estable a un recurso. `type`+`id` identifican el recurso; el
 *  resto es decorado que llega tarde y se parchea aparte (ver hooks). */
export interface RefRecurso {
  type: string;
  id: string;
  title?: string;
  detail?: string;
}

export interface Actividad extends RefRecurso {
  mode: ModoActividad;
}

/**
 * Lo que cada pestaña publica en el canal de presencia. Es efímero: vive en el
 * canal en memoria de Supabase Realtime y desaparece cuando la pestaña se cierra.
 *
 * `route` y `activity` van en `null` para el ADMIN (invisible): los demás ven
 * que está en línea, nunca en qué pantalla está. Ese vaciado ocurre al construir
 * el payload, no en el filtro de pantalla — es la única capa de ocultamiento que
 * de verdad no viaja por el cable.
 */
export interface MetaPresencia {
  user_id: string;
  nombre: string;
  rol: RolUsuario;
  avatar_url?: string | null;
  /** Color determinista por user_id, para que cada persona tenga siempre el suyo. */
  color: string;
  /** IDs de país a los que pertenece (derivados de sus sedes). Vacío si es global. */
  paises: string[];
  /** ADMIN y LIDER ven/alcanzan todo; se muestran a cualquiera. */
  esGlobal: boolean;
  /** ADMIN: publica identidad pero no ubicación. */
  invisible: boolean;
  /** ISO. Distingue sesiones vivas de pestañas muertas y elige la meta más
   *  reciente cuando alguien tiene varias pestañas abiertas. */
  online_at: string;
  route: string | null;
  /** Actividad principal (la más "interior": último editor/visor montado). Para
   *  la pila de avatares "en línea". */
  activity: Actividad | null;
  /** TODAS las actividades vivas de la pestaña, deduplicadas por type+id. Una
   *  pestaña puede tener varios recursos abiertos a la vez (p. ej. una
   *  devolución de varios equipos). Los chips y el banner por recurso miran
   *  aquí, no solo `activity`. */
  activities: Actividad[];
}

/** Un coeditor/observador ya deduplicado y visible. Igual forma que la meta. */
export type Peer = MetaPresencia;

/** Identidad base con la que un cliente se conecta (sin los campos volátiles
 *  route/activity/activities/online_at, que los pone el propio store al hacer track). */
export type IdentidadPresencia = Omit<MetaPresencia, 'route' | 'activity' | 'activities' | 'online_at'>;
