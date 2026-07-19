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
  '/usuarios': ['ADMIN', 'LIDER', 'JEFE_SEDE'],
  // Analítica agrega el parque completo para presentarlo fuera del equipo, así
  // que se restringe a los roles con visión global. JEFE_SEDE y TECNICO siguen
  // viendo su sede en el resto de pantallas vía `scopeEquipos`.
  '/analitica': ['ADMIN', 'LIDER'],
  // Solo el ADMIN resuelve solicitudes de borrado; si el solicitante pudiera
  // aprobarlas, la aprobación no significaría nada.
  '/solicitudes': ['ADMIN'],
};

/**
 * Quién puede retirar registros de la vista.
 *
 * TECNICO queda fuera a propósito: solo edita. Estas comprobaciones son de
 * interfaz — deciden si se pinta el botón — y NO son la barrera de seguridad.
 * Lo que de verdad impide la acción son las políticas RLS y los triggers de
 * `sql/01-borrado-suave.sql`, porque un usuario puede llamar a la API REST de
 * Supabase sin pasar por esta pantalla.
 */
export function puedeBorrar(rol: RolUsuario | undefined): boolean {
  return rol === 'ADMIN' || rol === 'LIDER' || rol === 'JEFE_SEDE';
}

/**
 * Si es true, la acción oculta el registro y abre una solicitud que el
 * administrador debe resolver. El ADMIN oculta y resuelve sin intermediarios.
 */
export function borradoRequiereAprobacion(rol: RolUsuario | undefined): boolean {
  return rol === 'LIDER' || rol === 'JEFE_SEDE';
}

export function esAdmin(rol: RolUsuario | undefined): boolean {
  return rol === 'ADMIN';
}

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
