import type { RolUsuario, Equipo, Perfil } from '@/types';

export const ROLES_EDICION: RolUsuario[] = ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'];

export const RUTA_ROLES: Record<string, RolUsuario[]> = {
  '/asignar': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  '/devolucion': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  '/escanear': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  '/colaboradores': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  // Salidas: los cuatro roles. Perseguir el equipo de quien se va es trabajo
  // de la mesa, no de administración; la pantalla se filtra sola por país.
  '/salidas': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  '/proveedores': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  '/reporte-proveedor': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  // Líneas móviles: la ven los cuatro roles. ADMIN y Jefe (LIDER) sobre todo el
  // parque; el Líder de sede y el Técnico sobre las líneas de sus sedes más las
  // que aún no tienen sede, que es de donde salen las asignaciones (el recorte
  // lo aplica la propia pantalla).
  '/lineas': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  // Control de tickets: es el trabajo diario de la mesa, así que entran los
  // cuatro roles. ADMIN y Jefe (LIDER) ven todos los tickets; el Líder de sede y
  // el Técnico, los de sus sedes más los que aún no tienen sede (el recorte lo
  // aplica la propia pantalla).
  '/tickets': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
  '/sedes': ['ADMIN'],
  '/integraciones': ['ADMIN'],
  // Ni el Líder de sede (JEFE_SEDE) ni el Técnico gestionan usuarios: no ven la
  // pantalla de Usuarios, ni los roles, ni a los demás. Solo ADMIN y LIDER (Jefe).
  '/usuarios': ['ADMIN', 'LIDER'],
  // Analítica: ADMIN y LIDER ven el parque completo; JEFE_SEDE y TECNICO también
  // entran, pero la propia pantalla aplica `scopeEquipos`, así que ven solo los
  // KPIs y gráficos de SUS sedes.
  '/analitica': ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'],
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
 * El TECNICO tiene las mismas capacidades que el JEFE_SEDE: la diferencia entre
 * ambos es de jerarquía (quién manda en la sede), no de permisos. Estas
 * comprobaciones son de interfaz — deciden si se pinta el botón — y NO son la
 * barrera de seguridad. Lo que de verdad impide la acción son las políticas RLS
 * y los triggers de borrado suave, porque un usuario puede llamar a la API REST
 * de Supabase sin pasar por esta pantalla.
 */
export function puedeBorrar(rol: RolUsuario | undefined): boolean {
  return rol === 'ADMIN' || rol === 'LIDER' || rol === 'JEFE_SEDE' || rol === 'TECNICO';
}

/**
 * Si es true, la acción oculta el registro y abre una solicitud que el
 * administrador debe resolver. El ADMIN oculta y resuelve sin intermediarios.
 */
export function borradoRequiereAprobacion(rol: RolUsuario | undefined): boolean {
  return rol === 'LIDER' || rol === 'JEFE_SEDE' || rol === 'TECNICO';
}

export function esAdmin(rol: RolUsuario | undefined): boolean {
  return rol === 'ADMIN';
}

/**
 * Roles que esta persona puede dar de alta.
 *
 * El Jefe (LIDER) crea equipo, no jefatura: otro Jefe, un Líder de sede y un
 * Técnico, pero nunca un Administrador — si pudiera, se fabricaría uno y por
 * ahí se ascendería a sí mismo. El Líder de sede y el Técnico no crean a nadie.
 *
 * Esto decide qué se pinta; quien manda de verdad es la Edge Function
 * `crear-usuario`, que vuelve a comprobarlo con la service_role key.
 */
export function rolesQuePuedeCrear(rol: RolUsuario | undefined): RolUsuario[] {
  if (rol === 'ADMIN') return ['ADMIN', 'LIDER', 'JEFE_SEDE', 'TECNICO'];
  if (rol === 'LIDER') return ['LIDER', 'JEFE_SEDE', 'TECNICO'];
  return [];
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
