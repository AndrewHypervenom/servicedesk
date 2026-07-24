import { useEffect, useRef } from 'react';
import { create } from 'zustand';

/**
 * Detección de despliegues nuevos.
 *
 * Una SPA se queda con el JavaScript que descargó al abrirla: si publicamos una
 * versión, quien tenga la pestaña abierta sigue con la vieja durante horas y
 * puede chocar contra una API que ya cambió. Cada compilación estampa el mismo
 * identificador en dos lugares (ver vite.config.ts):
 *
 *   · `__BUILD_ID__`  — dentro del bundle: lo que la pestaña ejecuta.
 *   · `/version.json` — archivo estático: lo que el servidor publica ahora.
 *
 * Si dejan de coincidir, hay versión nueva. No se usa un service worker a
 * propósito: esto es una consulta de 30 bytes y no necesita caché offline.
 *
 * Recargar sin avisar sería destructivo (un acta a medio firmar, una
 * importación en curso), así que las pantallas que tienen trabajo sin guardar
 * lo declaran con `useTrabajoEnCurso` y el aviso cambia de tono: si no hay nada
 * en riesgo se actualiza solo, y si lo hay espera a que la persona guarde.
 */

/** Cada cuánto se le pregunta al servidor. */
const INTERVALO_MS = 60_000;
/** Piso entre consultas: el foco y la visibilidad disparan seguido. */
const MINIMO_ENTRE_CONSULTAS_MS = 15_000;
/** Cuánto se calla el aviso cuando piden "más tarde". */
export const POSPONER_MS = 10 * 60_000;

interface EstadoActualizacion {
  /** Sello publicado cuando es distinto al que corre; null si estamos al día. */
  versionNueva: string | null;
  /** Momento (epoch ms) hasta el que el aviso no debe reaparecer. */
  silenciadoHasta: number;
  /** Trabajo sin guardar declarado por las pantallas: id → etiqueta visible. */
  trabajos: Record<string, string>;
  marcarVersion: (sello: string) => void;
  posponer: () => void;
  registrarTrabajo: (id: string, etiqueta: string) => void;
  liberarTrabajo: (id: string) => void;
}

export const useActualizacion = create<EstadoActualizacion>((set) => ({
  versionNueva: null,
  silenciadoHasta: 0,
  trabajos: {},

  marcarVersion: (sello) => set((s) => (s.versionNueva === sello ? s : { versionNueva: sello })),

  posponer: () => set({ silenciadoHasta: Date.now() + POSPONER_MS }),

  registrarTrabajo: (id, etiqueta) => set((s) => (
    s.trabajos[id] === etiqueta ? s : { trabajos: { ...s.trabajos, [id]: etiqueta } }
  )),

  liberarTrabajo: (id) => set((s) => {
    if (!(id in s.trabajos)) return s;
    const { [id]: _fuera, ...resto } = s.trabajos;
    return { trabajos: resto };
  }),
}));

/** Recarga saltándose la caché del navegador para el documento. */
export function recargarApp() {
  window.location.reload();
}

async function leerVersionPublicada(): Promise<string | null> {
  try {
    // `no-store` + parámetro único: algunos CDN sirven el JSON desde caché y
    // devolverían eternamente el sello viejo.
    const url = `${import.meta.env.BASE_URL}version.json?t=${Date.now()}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return typeof j?.buildId === 'string' ? j.buildId : null;
  } catch {
    // Sin red o servidor caído: no es asunto de este aviso, se reintenta luego.
    return null;
  }
}

/**
 * Consulta el sello publicado cada minuto, al volver a la pestaña y al
 * recuperar la conexión. Se monta una sola vez, en <App>.
 */
export function useDetectorDeVersion() {
  const ultima = useRef(0);

  useEffect(() => {
    // En `vite dev` no existe version.json (lo emite el build) y el HMR ya se
    // encarga de refrescar: el detector solo tiene sentido en producción.
    if (import.meta.env.DEV) return;

    let vivo = true;

    const consultar = async () => {
      const ahora = Date.now();
      if (!vivo || ahora - ultima.current < MINIMO_ENTRE_CONSULTAS_MS) return;
      ultima.current = ahora;
      const publicada = await leerVersionPublicada();
      if (!vivo || !publicada || publicada === __BUILD_ID__) return;
      useActualizacion.getState().marcarVersion(publicada);
    };

    const alVolver = () => { if (document.visibilityState === 'visible') consultar(); };

    consultar();
    const timer = window.setInterval(consultar, INTERVALO_MS);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', consultar);
    window.addEventListener('online', consultar);

    return () => {
      vivo = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', consultar);
      window.removeEventListener('online', consultar);
    };
  }, []);
}

/**
 * Declara que esta pantalla tiene trabajo que se perdería al recargar.
 * Mientras `activo` sea true, el aviso de versión no recarga solo y muestra la
 * `etiqueta` para que la persona sepa qué tiene pendiente.
 *
 *   useTrabajoEnCurso(seleccionados.length > 0, 'Acta de entrega sin firmar');
 */
export function useTrabajoEnCurso(activo: boolean, etiqueta: string) {
  // Un id estable por instancia del hook: dos pantallas con la misma etiqueta
  // no deben pisarse entre sí.
  const id = useRef<string>('');
  if (!id.current) id.current = `t${Math.random().toString(36).slice(2)}`;

  useEffect(() => {
    const { registrarTrabajo, liberarTrabajo } = useActualizacion.getState();
    if (activo) registrarTrabajo(id.current, etiqueta);
    else liberarTrabajo(id.current);
  }, [activo, etiqueta]);

  // Al desmontar (cerrar el modal, cambiar de página) el trabajo se libera
  // siempre, incluso si el efecto de arriba no llegó a correr.
  useEffect(() => () => useActualizacion.getState().liberarTrabajo(id.current), []);
}
