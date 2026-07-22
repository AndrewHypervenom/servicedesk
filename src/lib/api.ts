import { supabase } from './supabase';
import { tipoMovimientoEstado } from './estados';
import type {
  Equipo, Colaborador, Proveedor, Movimiento, Acta, Perfil, Integracion,
  TipoMovimiento, EstadoAsignacion, RolUsuario, Pais, Sede, Marca,
  EntidadBorrable, SolicitudBorrado, RegistroAuditoria,
} from '@/types';

// El filtro `eliminado_en is null` se repite en cliente aunque RLS ya lo aplica.
// No es redundancia inútil: para el ADMIN la política SÍ devuelve los ocultos
// (los necesita en Solicitudes), así que sin este filtro el administrador vería
// registros retirados mezclados en los listados normales.
export async function listEquipos(): Promise<Equipo[]> {
  const { data, error } = await supabase.from('equipos').select('*')
    .is('eliminado_en', null)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data as Equipo[];
}

export async function getEquipo(id: string): Promise<Equipo | null> {
  const { data, error } = await supabase.from('equipos').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Equipo) ?? null;
}

export async function findByCode(code: string): Promise<Equipo | null> {
  const c = code.trim().toUpperCase();
  const { data } = await supabase.from('equipos').select('*')
    .or(`codigo_qr.eq.${c},serial.eq.${c}`).limit(1);
  return (data?.[0] as Equipo) ?? null;
}

export async function createEquipo(e: Partial<Equipo>): Promise<Equipo> {
  const { data, error } = await supabase.from('equipos').insert(e).select().single();
  if (error) throw error;
  // El equipo ya quedó creado; el movimiento de recepción es su primer rastro de
  // trazabilidad. No se traga el error en silencio: si el RPC falla (p. ej. la
  // sobrecarga que devolvía 300) se avisa por consola, sin tumbar la creación.
  const { error: errMov } = await supabase.rpc('registrar_movimiento', {
    p_equipo_id: (data as Equipo).id, p_tipo: 'RECEPCION', p_estado_nuevo: 'DISPONIBLE',
  });
  if (errMov) console.error('registrar_movimiento (RECEPCION) falló:', errMov.message);
  if (e.marca) await ensureMarca(e.marca);
  return data as Equipo;
}

export async function updateEquipo(id: string, patch: Partial<Equipo>): Promise<void> {
  const { error } = await supabase.from('equipos').update(patch).eq('id', id);
  if (error) throw error;
}

export async function trazabilidad(equipoId: string): Promise<Movimiento[]> {
  const { data, error } = await supabase.rpc('trazabilidad_equipo', { p_equipo_id: equipoId });
  if (error) throw error;
  return data as Movimiento[];
}

export async function recentMovimientos(limit = 8): Promise<Movimiento[]> {
  const { data } = await supabase.from('movimientos').select('*').order('creado_en', { ascending: false }).limit(limit);
  return (data as Movimiento[]) ?? [];
}

/**
 * Movimientos desde una fecha, para las series temporales de Analítica.
 * Filtra en el servidor en vez de traerlo todo y recortar en el cliente: el
 * histórico de movimientos crece sin techo y es la tabla más grande del sistema.
 */
export async function movimientosDesde(desde: Date): Promise<Movimiento[]> {
  const { data, error } = await supabase
    .from('movimientos')
    .select('*')
    .gte('fecha', desde.toISOString())
    .order('fecha', { ascending: true });
  if (error) throw error;
  return (data as Movimiento[]) ?? [];
}

export async function asignarEquipo(p: {
  equipoId: string; cedula: string; proyecto: string; actaId?: string; registradoPor?: string; obs?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('asignar_equipo', {
    p_equipo_id: p.equipoId, p_cedula: p.cedula, p_proyecto: p.proyecto,
    p_acta_id: p.actaId ?? null, p_registrado_por: p.registradoPor ?? null, p_observaciones: p.obs ?? null,
  });
  if (error) throw error;
}

export async function devolverEquipo(p: {
  equipoId: string; aProveedor: boolean; proveedor?: string; actaId?: string; registradoPor?: string; obs?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('devolver_equipo', {
    p_equipo_id: p.equipoId, p_a_proveedor: p.aProveedor, p_proveedor: p.proveedor ?? null,
    p_acta_id: p.actaId ?? null, p_registrado_por: p.registradoPor ?? null, p_observaciones: p.obs ?? null,
  });
  if (error) throw error;
}

export async function registrarMovimiento(p: {
  equipoId: string; tipo: TipoMovimiento; estadoNuevo?: EstadoAsignacion; proyectoDestino?: string;
  proveedor?: string; obs?: string;
}): Promise<void> {
  const { error } = await supabase.rpc('registrar_movimiento', {
    p_equipo_id: p.equipoId, p_tipo: p.tipo, p_estado_nuevo: p.estadoNuevo ?? null,
    p_proyecto_destino: p.proyectoDestino ?? null, p_proveedor: p.proveedor ?? null, p_observaciones: p.obs ?? null,
  });
  if (error) throw error;
}

/**
 * Cambio manual de estado de asignación (a mantenimiento, baja o de vuelta a
 * disponible). Reutiliza `registrar_movimiento`, que aplica el nuevo estado y
 * deja el rastro en la trazabilidad. Las transiciones válidas se validan antes
 * en la interfaz con `transicionesEstado`; la base es la barrera final.
 */
export async function cambiarEstadoEquipo(p: {
  equipoId: string; estadoNuevo: EstadoAsignacion; obs?: string;
}): Promise<void> {
  await registrarMovimiento({
    equipoId: p.equipoId,
    tipo: tipoMovimientoEstado(p.estadoNuevo),
    estadoNuevo: p.estadoNuevo,
    obs: p.obs,
  });
}

export async function listColaboradores(): Promise<Colaborador[]> {
  const { data } = await supabase.from('colaboradores').select('*')
    .is('eliminado_en', null).order('nombre');
  return (data as Colaborador[]) ?? [];
}
export async function getColaborador(cedula: string): Promise<Colaborador | null> {
  const { data } = await supabase.from('colaboradores').select('*').eq('cedula', cedula.trim()).maybeSingle();
  return (data as Colaborador) ?? null;
}
/**
 * Ante un choque de unicidad (23505), dice qué campo lo causó. La cédula es la PK
 * y el correo tiene el índice `colaboradores_correo_unico`.
 */
export function campoDuplicado(e: unknown): 'correo' | 'cedula' | null {
  const err = e as { code?: string; message?: string };
  if (err?.code !== '23505') return null;
  return err.message?.includes('correo') ? 'correo' : 'cedula';
}

/** '' -> null, para que los campos vacíos no cuenten como valor repetido. */
const vacioANull = (c: Partial<Colaborador>): Partial<Colaborador> => {
  const limpio: Record<string, unknown> = { ...c };
  for (const [k, v] of Object.entries(limpio)) {
    if (typeof v === 'string' && v.trim() === '') limpio[k] = null;
    else if (typeof v === 'string') limpio[k] = v.trim();
  }
  return limpio as Partial<Colaborador>;
};

/** Alta de colaborador. Falla si la cédula o el correo ya existen: nunca sobrescribe. */
export async function crearColaborador(c: Colaborador): Promise<void> {
  const { error } = await supabase.from('colaboradores').insert(vacioANull(c));
  if (error) throw error;
}

/** Edita un colaborador. La cédula es la llave y no se toca: identifica la fila. */
export async function actualizarColaborador(cedula: string, c: Partial<Colaborador>): Promise<void> {
  const { cedula: _omit, creado_en: _omit2, ...campos } = c;
  const { error } = await supabase.from('colaboradores').update(vacioANull(campos)).eq('cedula', cedula);
  if (error) throw error;
}

export async function listProveedores(): Promise<Proveedor[]> {
  const { data } = await supabase.from('proveedores').select('*')
    .is('eliminado_en', null).order('nombre');
  return (data as Proveedor[]) ?? [];
}
export async function createProveedor(p: Partial<Proveedor>): Promise<void> {
  const { error } = await supabase.from('proveedores').insert(p);
  if (error) throw error;
}

export async function listMarcas(): Promise<Marca[]> {
  const { data } = await supabase.from('marcas').select('*').order('nombre');
  return (data as Marca[]) ?? [];
}
export async function ensureMarca(nombre: string): Promise<void> {
  const n = nombre.trim();
  if (!n) return;
  await supabase.from('marcas').upsert({ nombre: n }, { onConflict: 'nombre', ignoreDuplicates: true });
}

export async function createActa(a: Partial<Acta>): Promise<Acta> {
  const { data, error } = await supabase.from('actas').insert(a).select().single();
  if (error) throw error;
  return data as Acta;
}

export async function updateActa(id: string, patch: Partial<Acta>): Promise<void> {
  const { error } = await supabase.from('actas').update(patch).eq('id', id);
  if (error) throw error;
}

export async function subirActaFirmada(actaId: string, file: File): Promise<string | null> {
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
  const path = `${actaId}-firmada.${ext}`;
  const { error } = await supabase.storage.from('actas')
    .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' });
  if (error) throw error;
  const { data } = supabase.storage.from('actas').getPublicUrl(path);
  await supabase.from('actas').update({ archivo_firmado_url: data.publicUrl, firmado: true }).eq('id', actaId);
  return data.publicUrl;
}

export async function listActas(): Promise<Acta[]> {
  const { data } = await supabase.from('actas').select('*').order('creado_en', { ascending: false });
  return (data as Acta[]) ?? [];
}

export async function subirPdfActa(actaId: string, blob: Blob): Promise<string | null> {
  const path = `${actaId}.pdf`;
  const { error } = await supabase.storage.from('actas').upload(path, blob, { upsert: true, contentType: 'application/pdf' });
  if (error) throw error;
  const { data } = supabase.storage.from('actas').getPublicUrl(path);
  await supabase.from('actas').update({ pdf_url: data.publicUrl }).eq('id', actaId);
  return data.publicUrl;
}

export async function listIntegraciones(): Promise<Integracion[]> {
  const { data } = await supabase.from('integraciones').select('*').order('creado_en', { ascending: false });
  return (data as Integracion[]) ?? [];
}
export async function createIntegracion(i: Partial<Integracion>): Promise<void> {
  const { error } = await supabase.from('integraciones').insert(i);
  if (error) throw error;
}

/** Sedes de cada perfil (perfil_id -> sede_id[]), para la pantalla de Usuarios. */
export async function listSedesPorPerfil(): Promise<Record<string, string[]>> {
  const { data } = await supabase.from('perfil_sedes').select('perfil_id, sede_id');
  const mapa: Record<string, string[]> = {};
  for (const r of (data ?? []) as { perfil_id: string; sede_id: string }[]) {
    (mapa[r.perfil_id] ??= []).push(r.sede_id);
  }
  return mapa;
}

/** Reemplaza el conjunto de sedes de un perfil. Solo ADMIN y Jefe (RLS lo exige). */
export async function setSedesDePerfil(perfilId: string, sedeIds: string[]): Promise<void> {
  const { error: delErr } = await supabase.from('perfil_sedes').delete().eq('perfil_id', perfilId);
  if (delErr) throw delErr;
  if (!sedeIds.length) return;
  const { error } = await supabase.from('perfil_sedes')
    .insert(sedeIds.map((sede_id) => ({ perfil_id: perfilId, sede_id })));
  if (error) throw error;
}

export async function listPerfiles(): Promise<Perfil[]> {
  const { data } = await supabase.from('perfiles').select('*').order('nombre');
  return (data as Perfil[]) ?? [];
}
export async function updateRol(id: string, rol: Perfil['rol']): Promise<void> {
  const { error } = await supabase.from('perfiles').update({ rol }).eq('id', id);
  if (error) throw error;
}
export async function updateSedeUsuario(id: string, sedeId: string | null): Promise<void> {
  const { error } = await supabase.from('perfiles').update({ sede_id: sedeId }).eq('id', id);
  if (error) throw error;
}

export async function crearUsuario(p: {
  email: string; nombre: string; rol: RolUsuario;
  cedula?: string; sedeId?: string | null;
}): Promise<{ email: string; password: string }> {
  const { data, error } = await supabase.functions.invoke('crear-usuario', {
    body: { email: p.email, nombre: p.nombre, rol: p.rol, cedula: p.cedula, sede_id: p.sedeId ?? null },
  });
  if (error) {
    let msg = error.message;
    try { const ctx = await (error as any).context?.json(); if (ctx?.error) msg = ctx.error; } catch { /* noop */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return { email: data.email, password: data.password };
}

/**
 * Edita los datos de un usuario. Solo ADMIN (lo exige la RLS de `perfiles`).
 *
 * El correo no está entre los campos editables a propósito: es la credencial de
 * acceso y vive en `auth.users`. Cambiarlo solo aquí dejaría al usuario
 * entrando con el correo antiguo mientras la aplicación muestra el nuevo.
 */
export async function actualizarPerfil(id: string, patch: {
  nombre?: string; cedula?: string | null; cargo?: string | null;
  rol?: RolUsuario; sede_id?: string | null; activo?: boolean;
}): Promise<void> {
  const { error } = await supabase.from('perfiles').update(patch).eq('id', id);
  if (error) throw error;
}

/**
 * Elimina un usuario de `perfiles` y de Auth.
 *
 * Pasa por una Edge Function porque `auth.users` solo se toca con la
 * service_role key. Devuelve error legible si el usuario tiene historial, si es
 * el último administrador activo o si es uno mismo.
 */
export async function eliminarUsuario(id: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('eliminar-usuario', { body: { id } });
  if (error) {
    let msg = error.message;
    try { const ctx = await (error as any).context?.json(); if (ctx?.error) msg = ctx.error; } catch { /* noop */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
}

// ═══ Borrado suave y solicitudes ═════════════════════════════════════════
// Las reglas de quién puede hacer qué viven en RLS y en los triggers de
// `sql/01-borrado-suave.sql`. Lo de aquí es la llamada, no el permiso: si el
// SQL no se ha ejecutado, estas funciones fallarán o —peor— borrarán sin
// control. Ver el README de esa carpeta.

/**
 * Oculta un registro y abre la entrada correspondiente en la cola.
 *
 * No es una transacción: Supabase no expone varias sentencias en una sola
 * llamada desde el cliente. Se oculta primero y se registra la solicitud
 * después, porque el orden inverso dejaría solicitudes apuntando a registros
 * visibles. Si falla el segundo paso se revierte el ocultado a mano.
 */
export async function ocultarRegistro(p: {
  entidad: EntidadBorrable;
  id: string;
  etiqueta: string;
  motivo?: string;
  requiereAprobacion: boolean;
  solicitadoPor: string;
}): Promise<void> {
  const col = p.entidad === 'colaboradores' ? 'cedula' : 'id';
  const { error } = await supabase
    .from(p.entidad)
    .update({ eliminado_en: new Date().toISOString() })
    .eq(col, p.id);
  if (error) throw error;

  // La solicitud se crea SIEMPRE, también cuando la oculta el ADMIN. No es
  // solo una cola de aprobación: es el único registro de qué hay oculto. Sin
  // ella, lo que el administrador retira desaparece de todas las pantallas sin
  // dejar rastro y ya no hay forma de restaurarlo ni de purgarlo.
  const { error: errSol } = await supabase.from('solicitudes_borrado').insert({
    entidad: p.entidad,
    registro_id: p.id,
    etiqueta: p.etiqueta,
    motivo: p.motivo ?? null,
    solicitado_por: p.solicitadoPor,
  });

  if (errSol) {
    // Sin la solicitud, el registro quedaría oculto y sin que nadie pueda
    // resolverlo: invisible para quien lo ocultó y sin entrada en la cola.
    await supabase.from(p.entidad).update({ eliminado_en: null }).eq(col, p.id);
    throw errSol;
  }
}

export async function listSolicitudes(soloPendientes = false): Promise<SolicitudBorrado[]> {
  let q = supabase.from('solicitudes_borrado').select('*').order('solicitado_en', { ascending: false });
  if (soloPendientes) q = q.eq('estado', 'PENDIENTE');
  const { data, error } = await q;
  if (error) throw error;
  return (data as SolicitudBorrado[]) ?? [];
}

/** Cuenta de pendientes, para el distintivo del menú. */
export async function contarSolicitudesPendientes(): Promise<number> {
  const { count, error } = await supabase
    .from('solicitudes_borrado')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'PENDIENTE');
  if (error) throw error;
  return count ?? 0;
}

/** Devuelve el registro a la vista y cierra la solicitud. */
export async function restaurarRegistro(s: SolicitudBorrado, adminId: string): Promise<void> {
  const col = s.entidad === 'colaboradores' ? 'cedula' : 'id';
  const { error } = await supabase
    .from(s.entidad).update({ eliminado_en: null }).eq(col, s.registro_id);
  if (error) throw error;

  const { error: e2 } = await supabase.from('solicitudes_borrado')
    .update({ estado: 'RESTAURADA', resuelto_por: adminId, resuelto_en: new Date().toISOString() })
    .eq('id', s.id);
  if (e2) throw e2;
}

/**
 * Elimina el registro de la base. Puede fallar por diseño: los triggers
 * bloquean el borrado de equipos y colaboradores con historial. Ese error se
 * propaga tal cual para que la pantalla lo muestre.
 */
export async function eliminarDefinitivo(s: SolicitudBorrado, adminId: string): Promise<void> {
  const col = s.entidad === 'colaboradores' ? 'cedula' : 'id';
  const { error } = await supabase.from(s.entidad).delete().eq(col, s.registro_id);
  if (error) throw error;

  const { error: e2 } = await supabase.from('solicitudes_borrado')
    .update({ estado: 'APROBADA', resuelto_por: adminId, resuelto_en: new Date().toISOString() })
    .eq('id', s.id);
  if (e2) throw e2;
}

/**
 * Bitácora de actividad. Solo el ADMIN recibe filas (lo exige la RLS de
 * `auditoria`); para el resto la consulta devuelve 0 registros. Se trae un tope
 * y se filtra en cliente, como el resto de listados.
 */
export async function listAuditoria(limite = 500): Promise<RegistroAuditoria[]> {
  const { data, error } = await supabase.from('auditoria').select('*')
    .order('creado_en', { ascending: false }).limit(limite);
  if (error) throw error;
  return (data as RegistroAuditoria[]) ?? [];
}

export async function listPaises(): Promise<Pais[]> {
  const { data } = await supabase.from('paises').select('*').order('nombre');
  return (data as Pais[]) ?? [];
}
export async function createPais(nombre: string, codigo?: string): Promise<void> {
  const { error } = await supabase.from('paises').insert({ nombre, codigo: codigo || null });
  if (error) throw error;
}
export async function deletePais(id: string): Promise<void> {
  const { error } = await supabase.from('paises').delete().eq('id', id);
  if (error) throw error;
}

export async function listSedes(): Promise<Sede[]> {
  const { data } = await supabase.from('sedes').select('*, paises(nombre)').order('nombre');
  return ((data as any[]) ?? []).map((s) => ({
    id: s.id, nombre: s.nombre, pais_id: s.pais_id, creado_en: s.creado_en,
    pais_nombre: s.paises?.nombre ?? null,
  }));
}
export async function createSede(nombre: string, paisId: string): Promise<void> {
  const { error } = await supabase.from('sedes').insert({ nombre, pais_id: paisId });
  if (error) throw error;
}
export async function deleteSede(id: string): Promise<void> {
  const { error } = await supabase.from('sedes').delete().eq('id', id);
  if (error) throw error;
}
