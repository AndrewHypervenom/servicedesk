import { useEffect, useId, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { usePresence } from '@/store/presence';
import { puedeVerPeer, sanitizarPeer, ubicacionVisible } from './visibilidad';
import type { ModoActividad, Peer, RefRecurso } from './tipos';

/** Personas visibles que están en la MISMA vista (ruta) que yo ahora mismo.
 *  Para el aviso "Fulano también está en esta pantalla". */
export function usePeersEnMiVista(): Peer[] {
  const { pathname } = useLocation();
  const peers = usePresence((s) => s.peers);
  const yo = usePresence((s) => s.yo);
  return useMemo(() => {
    if (!yo) return [];
    // Solo cuenta quien comparte mi ruta y cuya ubicación puedo ver (la del
    // ADMIN queda oculta para roles inferiores, así que no dispara la píldora).
    return peers.filter(
      (p) => !!p.route && p.route === pathname && puedeVerPeer(yo, p) && ubicacionVisible(yo, p),
    );
  }, [peers, yo, pathname]);
}

/** Todos los presentes que ESTE usuario puede ver (con la ubicación saneada:
 *  la del ADMIN se oculta a quien no sea ADMIN/LIDER, mostrándolo "En línea"). */
export function usePeersEnLinea(): Peer[] {
  const peers = usePresence((s) => s.peers);
  const yo = usePresence((s) => s.yo);
  return useMemo(() => {
    if (!yo) return [];
    return peers.filter((p) => puedeVerPeer(yo, p)).map((p) => sanitizarPeer(yo, p));
  }, [peers, yo]);
}

/**
 * Solo lectura: quién está sobre un recurso concreto, para pintar avatares en
 * listas. No declara actividad propia. Excluye al ADMIN de forma natural: su
 * payload no lleva `activity`, así que nunca aparece "sobre" un recurso.
 */
export function usePeersDeRecurso(type: string | undefined, id: string | undefined): Peer[] {
  const peers = usePresence((s) => s.peers);
  const yo = usePresence((s) => s.yo);
  return useMemo(() => {
    if (!yo || !type || !id) return [];
    const res: Peer[] = [];
    for (const p of peers) {
      // Si no puedo ver su ubicación (ADMIN ante un rol inferior), tampoco debo
      // saber que está sobre este recurso.
      if (!puedeVerPeer(yo, p) || !ubicacionVisible(yo, p)) continue;
      // Una pestaña puede tener varios recursos abiertos: se busca ESTE en su
      // lista, no solo su actividad principal.
      const act = (p.activities ?? (p.activity ? [p.activity] : []))
        .find((a) => a.type === type && a.id === id);
      if (act) res.push({ ...p, activity: act }); // actividad ya relativa al recurso
    }
    return res;
  }, [peers, yo, type, id]);
}

/** Como `usePeersDeRecurso` pero para VARIOS ids del mismo tipo (multi-selección);
 *  cada peer se cuenta una vez, con la actividad del primer recurso que casa. */
export function usePeersDeRecursos(type: string, ids: string[]): Peer[] {
  const peers = usePresence((s) => s.peers);
  const yo = usePresence((s) => s.yo);
  const clave = ids.join(',');
  return useMemo(() => {
    if (!yo || ids.length === 0) return [];
    const set = new Set(ids);
    const porUsuario = new Map<string, Peer>();
    for (const p of peers) {
      if (!puedeVerPeer(yo, p) || !ubicacionVisible(yo, p)) continue;
      const act = (p.activities ?? (p.activity ? [p.activity] : []))
        .find((a) => a.type === type && set.has(a.id));
      if (act && !porUsuario.has(p.user_id)) porUsuario.set(p.user_id, { ...p, activity: act });
    }
    return [...porUsuario.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers, yo, type, clave]);
}

/**
 * Declara "edito este recurso" mientras el componente esté montado y devuelve
 * los coeditores (los otros que también lo tienen abierto).
 *
 * Regla anti-ráfaga: se ENTRA/SALE del recurso solo por type+id. Título y
 * detalle llegan tarde y cambian seguido; si fueran dependencias del efecto de
 * entrada, cada cambio haría "salir y entrar" = ráfaga que tumba el canal. Por
 * eso van en un efecto aparte con `patchActividad`.
 */
export function useActividad(ref: RefRecurso | null, mode: ModoActividad): Peer[] {
  const token = useId(); // identifica a ESTE hook en la pila del store
  const pushActividad = usePresence((s) => s.pushActividad);
  const patchActividad = usePresence((s) => s.patchActividad);
  const popActividad = usePresence((s) => s.popActividad);
  const type = ref?.type;
  const id = ref?.id;

  // Entra/sale SOLO por type+id. Título/detalle van en el efecto de abajo.
  useEffect(() => {
    if (!type || !id) return;
    pushActividad(token, { type, id, mode });
    return () => popActividad(token);
  }, [token, type, id, mode, pushActividad, popActividad]);

  useEffect(() => {
    if (!type || !id) return;
    patchActividad(token, { title: ref?.title, detail: ref?.detail });
  }, [token, type, id, ref?.title, ref?.detail, patchActividad]);

  return usePeersDeRecurso(type, id);
}

export function useEditingPresence(ref: RefRecurso | null): Peer[] {
  return useActividad(ref, 'edit');
}

/**
 * Igual que el anterior pero para consumo (mode 'view'): declara que se está
 * mirando el recurso, pero NO cuenta como choque de edición. Devuelve a los
 * demás que están sobre el recurso (útil para el banner "también lo están
 * viendo/editando").
 */
export function useViewingPresence(ref: RefRecurso | null): Peer[] {
  return useActividad(ref, 'view');
}
