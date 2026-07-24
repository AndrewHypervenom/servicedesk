import {
  LayoutDashboard, Boxes, Laptop, UserPlus, Undo2, ScanLine, Users, FileText,
  Truck, BarChart3, Building2, Plug, UserCog, Inbox, History, LineChart, Settings,
  Upload, Circle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Peer } from './tipos';

interface Vista {
  label: string;
  Icon: LucideIcon;
}

/** Ruta base ('/equipo/123' → '/equipo') → nombre legible + icono. */
const VISTAS: Record<string, Vista> = {
  '/': { label: 'Tablero', Icon: LayoutDashboard },
  '/inventario': { label: 'Inventario', Icon: Boxes },
  '/equipo': { label: 'Ficha de equipo', Icon: Laptop },
  '/asignar': { label: 'Asignación', Icon: UserPlus },
  '/devolucion': { label: 'Devolución', Icon: Undo2 },
  '/escanear': { label: 'Escanear', Icon: ScanLine },
  '/colaboradores': { label: 'Colaboradores', Icon: Users },
  '/actas': { label: 'Actas', Icon: FileText },
  '/proveedores': { label: 'Proveedores', Icon: Truck },
  '/reporte-proveedor': { label: 'Reporte proveedor', Icon: BarChart3 },
  '/sedes': { label: 'Sedes', Icon: Building2 },
  '/integraciones': { label: 'Integraciones', Icon: Plug },
  '/usuarios': { label: 'Usuarios', Icon: UserCog },
  '/solicitudes': { label: 'Solicitudes', Icon: Inbox },
  '/auditoria': { label: 'Auditoría', Icon: History },
  '/analitica': { label: 'Analítica', Icon: LineChart },
  '/ajustes': { label: 'Ajustes', Icon: Settings },
};

/** Icono/nombre de una ruta (por su primer segmento). */
export function vistaDeRuta(route: string | null | undefined): Vista {
  if (!route) return { label: 'En línea', Icon: Circle };
  const seg = route.split('/').filter(Boolean)[0];
  return VISTAS[seg ? `/${seg}` : '/'] ?? { label: 'En línea', Icon: Circle };
}

/**
 * Descripción rica de dónde está un peer, priorizando lo que edita/ve por
 * encima de la ruta. Devuelve texto + icono + si es edición (para el acento).
 */
export function descripcionPeer(peer: Peer): { label: string; Icon: LucideIcon; editando: boolean } {
  const act = peer.activity;
  if (act) {
    const editando = act.mode === 'edit';
    const nombre = act.title ?? vistaDeRuta(peer.route).label;
    const verbo = editando ? 'Editando' : 'Viendo';
    // Icono especial para importación; el resto hereda el de su vista.
    const Icon = act.type === 'importacion' ? Upload : vistaDeRuta(peer.route).Icon;
    return { label: `${verbo} ${nombre}`, Icon, editando };
  }

  // Sin ruta (ADMIN saneado para roles inferiores, o aún sin navegar): "En línea".
  if (!peer.route) return { label: 'En línea', Icon: Circle, editando: false };

  const v = vistaDeRuta(peer.route);
  return { label: `En ${v.label}`, Icon: v.Icon, editando: false };
}
