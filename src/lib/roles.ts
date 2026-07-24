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
  // El Líder de sede (JEFE_SEDE) no gestiona usuarios: no ve la pantalla de
  // Usuarios, ni los roles, ni a los técnicos. Solo ADMIN y LIDER (Jefe) entran.
  '/usuarios': ['ADMIN', 'LIDER'],
  // Analítica: ADMIN y LIDER ven el parque completo; el JEFE_SEDE también entra,
  // pero la propia pantalla aplica `scopeEquipos`, así que ve solo los KPIs y
  // gráficos de SU sede. TECNICO queda fuera (solo opera, no analiza).
  '/analitica': ['ADMIN', 'LIDER', 'JEFE_SEDE'],
  // Solo el ADMIN resuelve solicitudes de borrado; si el solicitante pudiera
  // aprobarlas, la aprobación no significaría nada.
  '/solicitudes': ['ADMIN'],
  // La bitácora de auditoría es de supervisión: solo el ADMIN. La RLS de la
  // tabla `auditoria` es la barrera real; esto solo oculta la vista.
  '/auditoria': ['ADMIN'],
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

/**
 * Recorta el parque a lo que la persona puede ver.
 *
 * El Líder de sede y el Técnico se asignan por PAÍS, así que su alcance son
 * TODAS las sedes de sus países, no una sola ciudad: `sedesPermitidas` es esa
 * lista ya expandida (`misSedes` del store). Se incluye además la sede
 * principal por si el store aún no terminó de cargar la expansión.
 */
export function scopeEquipos(
  equipos: Equipo[], perfil: Perfil | null, sedesPermitidas: string[] = [],
): Equipo[] {
  if (!perfil) return [];
  if (perfil.rol === 'JEFE_SEDE' || perfil.rol === 'TECNICO') {
    const permitidas = new Set(sedesPermitidas);
    if (perfil.sede_id) permitidas.add(perfil.sede_id);
    return equipos.filter((e) => e.sede_id && permitidas.has(e.sede_id));
  }
  return equipos;
}
