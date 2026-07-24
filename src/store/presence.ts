import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type {
  Actividad, IdentidadPresencia, MetaPresencia, Peer,
} from '@/lib/presence/tipos';

// Diagnóstico opcional: en la consola del navegador ejecuta
//   localStorage.setItem('presenceDebug','1')  y recarga
// para ver en consola los latidos y la lista de presentes.
const PRESENCE_DEBUG =
  typeof localStorage !== 'undefined' && localStorage.getItem('presenceDebug') === '1';

// ── Constantes de ritmo ────────────────────────────────────────────────────
const CANAL = 'presence:global';   // canal único (ver visibilidad.ts, capa de red)
const VENTANA_TRACK = 350;         // agrupa ráfagas en un solo track()
const LATIDO_MS = 25_000;          // re-emite aunque nadie navegue
const BACKOFF_INICIAL = 2_000;
const BACKOFF_MAX = 30_000;

// ── Estado mutable fuera de React ───────────────────────────────────────────
// El canal y los temporizadores NO viven en el store de zustand: cambiarlos no
// debe re-renderizar a nadie. El store solo expone lo que la UI pinta.
let canal: RealtimeChannel | null = null;
let identidad: IdentidadPresencia | null = null;
let rutaActual: string | null = null;
// Pila de actividades por token: en una misma pestaña pueden coexistir varios
// hooks sobre el mismo recurso (p. ej. ver la ficha del equipo Y abrir su modal
// de edición encima). Cada hook empuja con su token al montar y lo quita al
// desmontar; se publica la última empujada (la más "interior"). Así el cleanup
// de un hook no borra la actividad de otro que sigue vivo.
let pilaActividad: { token: string; act: Actividad }[] = [];
function actividadPublicada(): Actividad | null {
  return pilaActividad.length ? pilaActividad[pilaActividad.length - 1].act : null;
}
/** La pila deduplicada por type+id; si un recurso aparece en 'view' y 'edit'
 *  (p. ej. ver la ficha y abrir su modal), gana 'edit' (el choque real). */
function actividadesPublicadas(): Actividad[] {
  const porRecurso = new Map<string, Actividad>();
  for (const { act } of pilaActividad) {
    const clave = `${act.type}:${act.id}`;
    const previo = porRecurso.get(clave);
    if (!previo || (previo.mode === 'view' && act.mode === 'edit')) porRecurso.set(clave, act);
  }
  return [...porRecurso.values()];
}

let trackTimer: ReturnType<typeof setTimeout> | null = null;
let latidoTimer: ReturnType<typeof setInterval> | null = null;
let reconexionTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = BACKOFF_INICIAL;
/** Clave de presencia por pestaña: dos pestañas del mismo user son dos claves;
 *  se deduplican por user_id al agregar (ver `recalcularPeers`). */
const claveTab =
  (globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random().toString(36).slice(2)}`);

interface PresenceState {
  conectado: boolean;
  /** Identidad propia con la que filtramos (viewer). */
  yo: MetaPresencia | null;
  /** Todos los presentes, deduplicados por user_id (sin filtrar por rol). El
   *  filtro por rol/país lo aplican los selectores/hooks con `puedeVerPeer`. */
  peers: Peer[];
  conectar: (id: IdentidadPresencia, ruta: string | null) => void;
  desconectar: () => void;
  setRuta: (ruta: string | null) => void;
  pushActividad: (token: string, a: Actividad) => void;
  patchActividad: (token: string, patch: Partial<Pick<Actividad, 'title' | 'detail'>>) => void;
  popActividad: (token: string) => void;
}

// ── Construcción del payload ────────────────────────────────────────────────
// Todos publican su ubicación real, incluido el ADMIN. La ocultación de la
// ubicación del ADMIN frente a roles inferiores se hace en la capa de pantalla
// (`sanitizarPeer`/`ubicacionVisible`), no vaciando el payload: así dos ADMIN sí
// se ven entre sí. El campo `invisible` viaja como pista para esa capa.
function construirMeta(): MetaPresencia | null {
  if (!identidad) return null;
  return {
    ...identidad,
    online_at: new Date().toISOString(),
    route: rutaActual,
    activity: actividadPublicada(),
    activities: actividadesPublicadas(),
  };
}

function trackAhora() {
  const meta = construirMeta();
  if (meta) usePresence.setState({ yo: meta });
  if (!canal || !meta) return;
  // El track puede rechazarse si el canal aún no está suscrito; se ignora en
  // silencio porque el latido y el sync posterior lo vuelven a intentar.
  void canal.track(meta);
  if (PRESENCE_DEBUG) console.debug('[presence] track', meta.route, meta.activities);
}

/** Agrupa las ráfagas: al abrir un editor cambian título/ruta/sección en pocos
 *  ms; un track() por cada uno satura el canal, empieza a dar timed out y la
 *  persona desaparece para siempre. Un solo track al final de la ventana. */
function programarTrack() {
  if (trackTimer) clearTimeout(trackTimer);
  trackTimer = setTimeout(() => {
    trackTimer = null;
    trackAhora();
  }, VENTANA_TRACK);
}

// ── Agregación + dedupe ─────────────────────────────────────────────────────
function recalcularPeers() {
  if (!canal) return;
  const estado = canal.presenceState<MetaPresencia>();
  const porUsuario = new Map<string, MetaPresencia>();
  for (const metas of Object.values(estado)) {
    for (const m of metas) {
      if (!m?.user_id) continue;
      const previo = porUsuario.get(m.user_id);
      // Varias pestañas = varias metas: nos quedamos con la más reciente.
      if (!previo || m.online_at > previo.online_at) porUsuario.set(m.user_id, m);
    }
  }
  const lista = [...porUsuario.values()];
  if (PRESENCE_DEBUG) {
    console.debug('[presence] presentes:', lista.map((p) => `${p.nombre}(${p.rol}) → ${p.route ?? 'sin vista'}`));
  }
  usePresence.setState({ peers: lista });
}

// ── Latido y reconexión ─────────────────────────────────────────────────────
function iniciarLatido() {
  if (latidoTimer) clearInterval(latidoTimer);
  latidoTimer = setInterval(trackAhora, LATIDO_MS);
}
function pararTimers() {
  if (trackTimer) { clearTimeout(trackTimer); trackTimer = null; }
  if (latidoTimer) { clearInterval(latidoTimer); latidoTimer = null; }
  if (reconexionTimer) { clearTimeout(reconexionTimer); reconexionTimer = null; }
}

function programarReconexion() {
  if (reconexionTimer) return; // ya hay una en cola
  reconexionTimer = setTimeout(() => {
    reconexionTimer = null;
    backoff = Math.min(backoff * 2, BACKOFF_MAX);
    abrirCanal();
  }, backoff);
}

function abrirCanal() {
  if (!identidad) return;
  // Cierra cualquier canal previo antes de reabrir (reconexión).
  if (canal) { void supabase.removeChannel(canal); canal = null; }

  canal = supabase.channel(CANAL, {
    config: { presence: { key: claveTab } },
  });

  canal
    .on('presence', { event: 'sync' }, recalcularPeers)
    .on('presence', { event: 'join' }, recalcularPeers)
    .on('presence', { event: 'leave' }, recalcularPeers)
    .subscribe((status) => {
      if (PRESENCE_DEBUG) console.debug('[presence] canal:', status);
      if (status === 'SUBSCRIBED') {
        backoff = BACKOFF_INICIAL;
        usePresence.setState({ conectado: true });
        trackAhora();
        iniciarLatido();
      } else if (
        status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED'
      ) {
        usePresence.setState({ conectado: false });
        // Backoff creciente, no bucle: 2s → 4s → … → 30s.
        programarReconexion();
      }
    });
}

export const usePresence = create<PresenceState>(() => ({
  conectado: false,
  yo: null,
  peers: [],

  conectar: (id, ruta) => {
    identidad = id;
    rutaActual = ruta;
    pilaActividad = [];
    backoff = BACKOFF_INICIAL;
    abrirCanal();
  },

  desconectar: () => {
    pararTimers();
    if (canal) { void supabase.removeChannel(canal); canal = null; }
    identidad = null;
    rutaActual = null;
    pilaActividad = [];
    usePresence.setState({ conectado: false, yo: null, peers: [] });
  },

  setRuta: (ruta) => {
    if (ruta === rutaActual) return;
    rutaActual = ruta;
    programarTrack();
  },

  // Entra al recurso. Los hooks lo llaman SOLO cuando cambia type+id.
  pushActividad: (token, a) => {
    pilaActividad = [...pilaActividad.filter((e) => e.token !== token), { token, act: a }];
    programarTrack();
  },

  // Título/detalle llegan tarde y cambian seguido: se parchean sobre la
  // actividad viva sin volver a "entrar" al recurso (eso dispararía ráfagas).
  patchActividad: (token, patch) => {
    let cambio = false;
    pilaActividad = pilaActividad.map((e) => {
      if (e.token !== token) return e;
      cambio = true;
      return { ...e, act: { ...e.act, ...patch } };
    });
    if (cambio) programarTrack();
  },

  // Sale del recurso (desmontaje del hook).
  popActividad: (token) => {
    const antes = pilaActividad.length;
    pilaActividad = pilaActividad.filter((e) => e.token !== token);
    if (pilaActividad.length !== antes) programarTrack();
  },
}));
