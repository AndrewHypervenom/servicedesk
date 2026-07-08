import type { RolUsuario, Equipo, Perfil } from '@/types';

export const ROLES_EDICION: RolUsuario[] = ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'];

export const RUTA_ROLES: Record<string, RolUsuario[]> = {
  '/asignar': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  '/devolucion': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  '/escanear': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  '/colaboradores': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  '/proveedores': ['ADMIN', 'LIDER', 'JEFE_SEDE'],
  '/reporte-proveedor': ['ADMIN', 'LIDER', 'JEFE_SEDE'],
  '/sedes': ['ADMIN'],
  '/integraciones': ['ADMIN'],
  '/usuarios': ['ADMIN'],
};

export function puedeVerRuta(rol: RolUsuario | undefined, ruta: string): boolean {
  if (!rol) return false;
  const permitidos = RUTA_ROLES[ruta];
  return !permitidos || permitidos.includes(rol);
}

export function scopeEquipos(equipos: Equipo[], perfil: Perfil | null): Equipo[] {
  if (!perfil) return [];
  if (perfil.rol === 'JEFE_SEDE' || perfil.rol === 'TECNICO') {
    return equipos.filter((e) => e.sede_id && e.sede_id === perfil.sede_id);
  }
  return equipos;
}
