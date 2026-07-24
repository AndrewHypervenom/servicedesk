import type { RolUsuario } from '@/types';
import type { MetaPresencia, Peer } from './tipos';

/**
 * Modelo de visibilidad en DOS capas.
 *
 * 1) Capa de red (canal): aquí es un canal ÚNICO, por decisión de producto. Eso
 *    significa que la separación real por país NO viaja por el cable: todo el
 *    mundo recibe todas las metas y quien comparte canal puede leerlas desde la
 *    consola. Es un compromiso aceptado para esta herramienta interna. La única
 *    ocultación que sí es a prueba de consola es la del ADMIN: su payload sale
 *    sin `route`/`activity` (ver construcción del payload en el store).
 *
 * 2) Capa de pantalla (`puedeVerPeer`): filtra lo que ya llegó, por rol/país.
 *    Es la que decide qué se PINTA, no la que impide la fuga.
 *
 * Reglas (nombres de rol según el código: LIDER = "Jefe", opera todo el país;
 * JEFE_SEDE = "líder de sede", atado a una sede):
 *   - ADMIN  → ve a todos; su propia ubicación es invisible para los demás.
 *   - LIDER  → ve a todos (la UI los agrupa por país); sí publica ubicación.
 *   - JEFE_SEDE / TECNICO → ven solo a quien comparte al menos un país, más a
 *     los globales (ADMIN como "en línea, sin ubicación"; LIDER con ubicación).
 */
export function esGlobalRol(rol: RolUsuario): boolean {
  return rol === 'ADMIN' || rol === 'LIDER';
}

function comparteEsPais(a: string[], b: string[]): boolean {
  return a.some((p) => b.includes(p));
}

export function puedeVerPeer(viewer: MetaPresencia, peer: Peer): boolean {
  if (peer.user_id === viewer.user_id) return false; // uno mismo no se cuenta
  if (viewer.rol === 'ADMIN' || viewer.rol === 'LIDER') return true;
  if (peer.esGlobal) return true; // ADMIN (sin ubicación) y LIDER visibles a todos
  return comparteEsPais(peer.paises, viewer.paises);
}

/**
 * ¿Puede este viewer ver DÓNDE está el peer (su vista/lo que edita)?
 *
 * Regla por rol:
 *   - ADMIN ve la vista de TODOS (incluida la de otros ADMIN).
 *   - Los demás (LIDER, JEFE_SEDE, TECNICO) ven que un ADMIN está "En línea"
 *     pero NO en qué vista está.
 *   - La ubicación del resto de roles es visible con normalidad.
 *
 * Ojo: con canal único esta ocultación es de pantalla, no del cable (ver nota
 * arriba); si importa la fuga, hay que usar canales privados del proveedor.
 */
export function ubicacionVisible(viewer: MetaPresencia, peer: Peer): boolean {
  if (peer.rol === 'ADMIN' && viewer.rol !== 'ADMIN') return false;
  return true;
}

/** Devuelve el peer tal cual si puedo ver su ubicación; si no, con la vista
 *  borrada (route/activity vacíos) para que la UI lo muestre solo "En línea". */
export function sanitizarPeer(viewer: MetaPresencia, peer: Peer): Peer {
  if (ubicacionVisible(viewer, peer)) return peer;
  return { ...peer, route: null, activity: null, activities: [] };
}

/**
 * Destino "seguro" al seguir a una persona: el ÁREA donde trabaja, nunca dentro
 * del recurso que tiene abierto. Entrar al mismo recurso que otro edita es justo
 * el choque de autoguardado que queremos evitar.
 */
const AREA_POR_TIPO: Record<string, string> = {
  equipo: '/inventario',
  colaborador: '/colaboradores',
  importacion: '/inventario',
  acta: '/actas',
  proveedor: '/proveedores',
};

/** Primer segmento de una ruta: '/equipo/123' → '/equipo'. */
function baseRuta(route: string | null): string {
  if (!route) return '/';
  const seg = route.split('/').filter(Boolean)[0];
  return seg ? `/${seg}` : '/';
}

export function destinoSeguro(peer: Peer): string {
  if (peer.activity) return AREA_POR_TIPO[peer.activity.type] ?? baseRuta(peer.route);
  // Sin actividad declarada: manda a la lista del área, no a una ficha concreta.
  const base = baseRuta(peer.route);
  return base === '/equipo' ? '/inventario' : base;
}
